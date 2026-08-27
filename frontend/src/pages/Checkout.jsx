import React, { useState, useContext, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { clearPurchasedItems } from '../redux/cartSlice';
import API_URL from '../config/api';

const Checkout = () => {
  const PAYMENT_VERIFICATION_ATTEMPTS = 10;
  const PAYMENT_VERIFICATION_DELAY_MS = 3000;
  const { user } = useContext(AuthContext);
  const cartItems = useSelector((state) => state.cart.cartItems);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const verificationStarted = useRef(false);
  const [isStartingPayment, setIsStartingPayment] = useState(false);

  const [address, setAddress] = useState({
    fullName: '', street: '', city: '', postalCode: '', country: ''
  });

  const totalPrice = cartItems.reduce((acc, item) => acc + item.price * item.qty, 0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const orderId = params.get('orderId') || params.get('order_id');
    const tracker = params.get('tracker');
    if ((!payment && !tracker) || !user?.token || verificationStarted.current) return;

    const confirmPayment = async () => {
      if (payment === 'cancelled') {
        alert('Payment was cancelled. Your order is still pending.');
        return;
      }
      if (!tracker) {
        alert('Unable to verify payment');
        return;
      }
      verificationStarted.current = true;
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[Safepay] calling verification endpoint', { orderId, tracker });
        }
        for (let attempt = 1; attempt <= PAYMENT_VERIFICATION_ATTEMPTS; attempt += 1) {
          const response = await fetch(`${API_URL}/api/payment/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${user.token}`
            },
            body: JSON.stringify({ ...(orderId ? { orderId } : {}), tracker })
          });
          const data = await response.json().catch(() => ({}));
          if (process.env.NODE_ENV !== 'production') {
            console.debug('[Safepay] verification response', { attempt, status: response.status, data });
          }
          if (!response.ok) throw new Error(data.message || 'Payment confirmation failed');
          if (data.paymentStatus === 'Paid') {
            dispatch(clearPurchasedItems(data.itemIds || []));
            navigate('/ordersuccess', { replace: true });
            return;
          }
          if (data.paymentStatus === 'Failed') {
            throw new Error('Payment was not completed');
          }
          if (attempt < PAYMENT_VERIFICATION_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, PAYMENT_VERIFICATION_DELAY_MS));
          }
        }
        alert('Payment is still being confirmed. Please check your orders shortly.');
      } catch (error) {
        alert(error.message);
      }
    };
    confirmPayment();
  }, [dispatch, navigate, user]);

  const handlePayment = async () => {
    if (isStartingPayment || !cartItems.length) return;
    setIsStartingPayment(true);
    try {
      const saveOrderRes = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ items: cartItems, address })
      });
      const savedOrder = await saveOrderRes.json().catch(() => ({}));
      if (!saveOrderRes.ok) throw new Error(savedOrder.message || 'Unable to create order');

      const orderRes = await fetch(`${API_URL}/api/payment/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({ orderId: savedOrder._id })
      });

      if (!orderRes.ok) {
        let errorMessage = 'Payment failed to initialize';
        const contentType = orderRes.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          const errorData = await orderRes.json().catch(() => ({}));
          errorMessage = errorData.message || errorMessage;
        } else {
          const text = await orderRes.text().catch(() => '');
          if (text) errorMessage = text.slice(0, 120);
        }

        console.error('Payment init failed:', errorMessage);

        return alert(errorMessage);
      }

      const orderData = await orderRes.json();

      window.location.assign(orderData.checkoutUrl);
    } catch (error) {
      alert(error.message || 'Payment failed to initialize');
    } finally {
      setIsStartingPayment(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!user) {
      alert("Please login first");
      navigate('/login');
      return;
    }
    handlePayment();
  };

  return (
    <div className="checkout-container">
      <h2>Checkout</h2>
      <div className="checkout-content">
        <form onSubmit={handleSubmit} className="shipping-form">
          <h3>Shipping Address</h3>
          <input type="text" placeholder="Full Name" required value={address.fullName} onChange={(e) => setAddress({ ...address, fullName: e.target.value })} />
          <input type="text" placeholder="Street" required value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
          <input type="text" placeholder="City" required value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
          <input type="text" placeholder="Postal Code" required value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} />
          <input type="text" placeholder="Country" required value={address.country} onChange={(e) => setAddress({ ...address, country: e.target.value })} />
          <div className="checkout-summary">
            <h4>Total to Pay: PKR {totalPrice.toFixed(2)}</h4>
            <button type="submit" className="btn" disabled={isStartingPayment || !cartItems.length}>
              {isStartingPayment ? 'Preparing payment…' : 'Pay Now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Checkout;
