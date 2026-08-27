const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../model/Order');
const Product = require('../model/Product');
const Safepay = require('@sfpy/node-core');
const { getSafepayConfig, getMissingSafepayConfig } = require('../config/safepay');

const getSafepay = (secretKey, environment) => Safepay(secretKey, {
    authType: 'secret',
    host: environment === 'production'
        ? 'https://api.getsafepay.com'
        : 'https://sandbox.api.getsafepay.com'
});
const getTracker = (payload) => payload?.data?.tracker || {};

const getSafepayErrorDetails = (error) => ({
    status: error?.status,
    message: error?.message
});

const logPaymentVerification = (event, details) => {
    if (process.env.NODE_ENV !== 'production') {
        console.debug(`[Safepay] ${event}`, details);
    }
};

const finalizePaidOrder = async (orderId, tracker) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const order = await Order.findOne({ _id: orderId, paymentId: tracker }).session(session);
        if (!order) throw new Error('Payment not found');
        if (order.stockDeducted) {
            await session.commitTransaction();
            return order;
        }

        const claimedOrder = await Order.findOneAndUpdate(
            { _id: order._id, paymentId: tracker, stockDeducted: false },
            { $set: { stockDeducted: true } },
            { new: true, session }
        );
        if (!claimedOrder) {
            await session.commitTransaction();
            return order;
        }
        order.stockDeducted = true;

        for (const item of order.items) {
            const product = await Product.findOneAndUpdate(
                { _id: item.productId, stock: { $gte: item.qty } },
                { $inc: { stock: -item.qty } },
                { new: true, session }
            );
            if (!product) throw new Error(`Insufficient stock for product ${item.productId}`);
        }

        order.paymentStatus = 'Paid';
        order.paidAt = order.paidAt || new Date();
        await order.save({ session });
        await session.commitTransaction();
        return order;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

const createOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({ message: 'Invalid orderId' });
        }
        const order = await Order.findOne({ _id: orderId, userId: req.user._id });
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.paymentStatus === 'Paid') return res.status(409).json({ message: 'Order is already paid' });

        const config = getSafepayConfig();
        const missing = getMissingSafepayConfig(config, ['SAFEPAY_API_KEY', 'SAFEPAY_SECRET_KEY']);
        if (missing.length) return res.status(503).json({ message: `Payment service is not configured. Missing: ${missing.join(', ')}` });
        const safepay = getSafepay(config.secretKey, config.environment);
        const session = await safepay.payments.session.setup({
            merchant_api_key: config.apiKey,
            intent: 'CYBERSOURCE',
            mode: 'payment',
            entry_mode: 'raw',
            currency: 'PKR',
            amount: Math.round(order.totalAmount * 100),
            metadata: { source: 'shopin', order_id: order._id.toString() },
            include_fees: false
        });
        const tracker = getTracker(session).token;
        if (!tracker) return res.status(502).json({ message: 'Invalid payment session response' });

        order.paymentId = tracker;
        await order.save();

        const passport = await safepay.client.passport.create();
        const authToken = passport?.data;
        if (!authToken) return res.status(502).json({ message: 'Invalid payment authentication response' });

        const buildCheckoutReturnUrl = (payment) => {
            const returnUrl = new URL('/checkout', config.clientUrl);
            returnUrl.searchParams.set('payment', payment);
            returnUrl.searchParams.set('orderId', order._id.toString());
            returnUrl.searchParams.set('tracker', tracker);
            return returnUrl.toString();
        };

        const checkoutUrl = safepay.checkout.createCheckoutUrl({
            env: config.environment,
            tbt: authToken,
            tracker,
            source: 'hosted',
            order_id: order._id.toString(),
            cancel_url: buildCheckoutReturnUrl('cancelled'),
            redirect_url: buildCheckoutReturnUrl('success')
        });
        return res.status(201).json({ orderId: order._id, tracker, checkoutUrl, paymentStatus: order.paymentStatus });
    } catch (error) {
        console.error('Safepay session creation failed:', error.message);
        return res.status(502).json({ message: 'Unable to create payment session' });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { orderId, tracker } = req.body;
        logPaymentVerification('verification requested', { orderId, tracker });
        if (!orderId || !tracker) return res.status(400).json({ message: 'orderId and tracker are required' });
        if (!mongoose.isValidObjectId(orderId)) return res.status(400).json({ message: 'Invalid orderId' });
        const order = await Order.findOne({ _id: orderId, userId: req.user._id });
        if (!order || !order.paymentId || tracker !== order.paymentId) {
            logPaymentVerification('tracker/order mismatch', { orderFound: Boolean(order), trackerMatches: order?.paymentId === tracker });
            return res.status(404).json({ message: 'Payment not found' });
        }
        const config = getSafepayConfig();
        const missing = getMissingSafepayConfig(config, ['SAFEPAY_SECRET_KEY']);
        if (missing.length) return res.status(503).json({ message: `Payment service is not configured. Missing: ${missing.join(', ')}` });
        const safepay = getSafepay(config.secretKey, config.environment);
        logPaymentVerification('calling Safepay reporter', { method: 'GET', tracker });
        const response = await safepay.reporter.payments.fetch(tracker);
        logPaymentVerification('Safepay reporter response', {
            status: response?.status,
            state: response?.data?.tracker?.state,
            tracker: response?.data?.tracker?.token || response?.data?.tracker?.tracker
        });
        const verifiedTracker = response?.data?.tracker?.token || response?.data?.tracker?.tracker;
        if (verifiedTracker && verifiedTracker !== tracker) {
            return res.status(502).json({ message: 'Safepay tracker mismatch' });
        }
        const state = response?.data?.tracker?.state;
        if (state === 'TRACKER_ENDED') {
            const finalizedOrder = await finalizePaidOrder(order._id, order.paymentId);
            return res.json({
                orderId: finalizedOrder._id,
                paymentStatus: finalizedOrder.paymentStatus,
                itemIds: finalizedOrder.items.map((item) => item.productId.toString()),
                state
            });
        } else if (['TRACKER_FAILED', 'TRACKER_CANCELLED', 'TRACKER_EXPIRED'].includes(state)) {
            order.paymentStatus = 'Failed';
            await order.save();
        }
        return res.json({ orderId: order._id, paymentStatus: order.paymentStatus, state });
    } catch (error) {
        const details = getSafepayErrorDetails(error);
        console.error('[Safepay] verification failed', details);
        if (error?.message?.startsWith('Insufficient stock')) {
            return res.status(409).json({ message: 'Insufficient stock available to complete this order' });
        }
        return res.status(502).json({ message: 'Unable to verify payment' });
    }
};

const webhook = async (req, res) => {
    const config = getSafepayConfig();
    const secret = config.webhookSecret;
    const signature = req.get('X-SFPY-SIGNATURE');
    if (!secret) return res.status(503).json({ message: 'Webhook is not configured. Missing: SAFEPAY_WEBHOOK_SECRET' });
    if (!signature || !req.rawBody) return res.status(400).json({ message: 'Invalid webhook' });
    const expected = crypto.createHmac('sha512', secret).update(req.rawBody).digest('hex');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return res.status(400).json({ message: 'Invalid webhook' });
    }
    const event = req.body;
    const payment = event?.data || {};
    const orderId = payment.metadata?.order_id;
    const order = mongoose.isValidObjectId(orderId) ? await Order.findById(orderId) : null;
    if (order && order.paymentId === payment.tracker && event.type === 'payment.succeeded' && !order.stockDeducted) {
        try {
            await finalizePaidOrder(order._id, payment.tracker);
        } catch (error) {
            console.error('Inventory finalization failed:', error.message);
            return res.status(409).json({ message: 'Unable to complete order because stock is unavailable' });
        }
    } else if (order && order.paymentId === payment.tracker && event.type === 'payment.failed' && order.paymentStatus !== 'Paid') {
        order.paymentStatus = 'Failed';
        await order.save();
    }
    return res.sendStatus(200);
};

module.exports = { createOrder, verifyPayment, webhook };
