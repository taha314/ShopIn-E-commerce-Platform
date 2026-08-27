import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { removeFromCart, updateQuantity } from '../redux/cartSlice';
import '../styles/cart.css';
import API_URL from '../config/api';

const Cart = () => {
  const cartItems = useSelector((state) => state.cart.cartItems);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [stockByProduct, setStockByProduct] = useState({});

  useEffect(() => {
    const loadStock = async () => {
      const entries = await Promise.all(cartItems.map(async (item) => {
        const response = await fetch(`${API_URL}/api/products/${item.productId}`);
        if (!response.ok) return [item.productId, item.stock];
        const product = await response.json();
        return [item.productId, product.stock];
      }));
      setStockByProduct(Object.fromEntries(entries));
    };
    if (cartItems.length) loadStock();
  }, [cartItems]);

  const handleRemove = (id) => {
    dispatch(removeFromCart(id));
  };

  const handleUpdateQty = (item, qty) => {
    const currentStock = stockByProduct[item.productId] ?? item.stock;
    if (qty > currentStock) return alert(`Only ${currentStock} unit${currentStock === 1 ? '' : 's'} available`);
    if (qty > 0) dispatch(updateQuantity({ productId: item.productId, qty, stock: currentStock }));
  };

  const totalPrice = cartItems.reduce((acc, item) => acc + item.price * item.qty, 0);

  return (
    <div className="cart-container">
      <h2>Shopping Cart</h2>
      {cartItems.length === 0 ? (
        <p>Your cart is empty. <Link to="/shop">Go Shopping</Link></p>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {cartItems.map((item) => (
              <div key={item.productId} className="cart-item">
                <img src={item.imageUrl} alt={item.name} className="cart-item-image" />
                <div className="cart-item-details">
                  <h4>{item.name}</h4>
                  <p>PKR {item.price}</p>
                  <div className="qty-controls">
                    <button onClick={() => handleUpdateQty(item, item.qty - 1)}>-</button>
                    <span>{item.qty}</span>
                    <button disabled={item.qty >= (stockByProduct[item.productId] ?? item.stock)} onClick={() => handleUpdateQty(item, item.qty + 1)}>+</button>
                  </div>
                  <button onClick={() => handleRemove(item.productId)} className="btn-remove">Remove</button>
                </div>
              </div>
            ))}
          </div>
          <div className="cart-summary">
            <h3>Total: PKR {totalPrice.toFixed(2)}</h3>
            <button onClick={() => navigate('/checkout')} className="btn btn-checkout">Proceed to Checkout</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cart;
