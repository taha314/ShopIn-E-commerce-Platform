const Order = require('../model/Order');
const Product = require('../model/Product');
const mongoose = require('mongoose');
const sendEmail = require('../utils/sendEmail');

const addOrderItems = async (req, res) => {
    try {
        const { items, address } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'No order items' });
        }
        const requiredAddressFields = ['fullName', 'street', 'city', 'postalCode', 'country'];
        if (!address || requiredAddressFields.some((field) => !String(address[field] || '').trim())) {
            return res.status(400).json({ message: 'A complete shipping address is required' });
        }
        if (items.some((item) => !mongoose.isValidObjectId(item?.productId))) {
            return res.status(400).json({ message: 'One or more order items are invalid' });
        }

        const productIds = items.map((item) => String(item.productId));
        if (new Set(productIds).size !== productIds.length) {
            return res.status(400).json({ message: 'Each product may appear only once in an order' });
        }
        const products = await Product.find({ _id: { $in: productIds } });
        const productsById = new Map(products.map((product) => [product._id.toString(), product]));
        const normalizedItems = items.map((item) => {
            const product = productsById.get(String(item.productId));
            const qty = Number(item.qty);
            if (!product) {
                const error = new Error('Product not found');
                error.statusCode = 400;
                throw error;
            }
            if (!Number.isInteger(qty) || qty < 1) {
                const error = new Error(`Invalid quantity for ${product.name}`);
                error.statusCode = 400;
                throw error;
            }
            if (product.stock <= 0) {
                const error = new Error(`${product.name} is out of stock`);
                error.statusCode = 409;
                throw error;
            }
            if (qty > product.stock) {
                const error = new Error(`Insufficient stock for ${product.name}`);
                error.statusCode = 409;
                throw error;
            }
            return { productId: product._id, qty, price: product.price };
        });
        const totalAmount = Number(normalizedItems.reduce((total, item) => total + item.price * item.qty, 0).toFixed(2));
        const order = new Order({
            userId: req.user._id,
            items: normalizedItems,
            totalAmount,
            address,
            paymentMethod: 'Safepay'
        });
        const createdOrder = await order.save();

        // Send Order Confirmation Email
        const message = `
        <h2>Order Confirmation</h2>
        <p>Hello ${req.user.name},</p>
        <p>Your order has been received! Order ID: <strong>${createdOrder._id}</strong></p>
            <p>Order total: PKR ${totalAmount.toFixed(2)}</p>
        <p>It will be shipped to: ${address.street}, ${address.city}</p>
        <p>Thank you for shopping with ShopIn!</p>
      `;

        try {
            await sendEmail({
                to: req.user.email,
                subject: 'ShopIn - Order Confirmation',
                text: `Your order ${createdOrder._id} has been received. Order total: PKR ${totalAmount.toFixed(2)}.`,
                html: message
            });
        } catch (emailError) {
            // The order was saved successfully, so an email outage must not turn it into a failed order.
            console.error(`Order confirmation email failed for ${createdOrder._id}:`, emailError.message);
        }

        res.status(201).json(createdOrder);
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
    }
};

const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user._id });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOrders = async (req, res) => {
    try {
        const orders = await Order.find({}).populate('userId', 'id name');
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (order) {
            order.status = req.body.status || order.status;
            const updatedOrder = await order.save();
            res.json(updatedOrder);
        } else {
            res.status(404).json({ message: 'Order not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { addOrderItems, getMyOrders, getOrders, updateOrderStatus };
