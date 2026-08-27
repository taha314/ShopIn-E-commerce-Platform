import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    cartItems: localStorage.getItem('cartItems') ? JSON.parse(localStorage.getItem('cartItems')) : [],
};

const cartSlice = createSlice({
    name: 'cart',
    initialState,
    reducers: {
        addToCart: (state, action) => {
            const item = action.payload;
            const existItem = state.cartItems.find((x) => x.productId === item.productId);
            if (existItem) {
                if (typeof item.stock === 'number' && existItem.qty + item.qty > item.stock) return;
                existItem.qty += item.qty;
                existItem.stock = item.stock;
            } else {
                if (typeof item.stock === 'number' && item.stock <= 0) return;
                state.cartItems.push(item);
            }
            localStorage.setItem('cartItems', JSON.stringify(state.cartItems));
        },
        updateQuantity: (state, action) => {
            const { productId, qty, stock } = action.payload;
            const item = state.cartItems.find((cartItem) => cartItem.productId === productId);
            if (!item || qty < 1 || (typeof stock === 'number' && qty > stock)) return;
            item.qty = qty;
            item.stock = stock;
            localStorage.setItem('cartItems', JSON.stringify(state.cartItems));
        },
        removeFromCart: (state, action) => {
            state.cartItems = state.cartItems.filter((x) => x.productId !== action.payload);
            localStorage.setItem('cartItems', JSON.stringify(state.cartItems));
        },
        clearPurchasedItems: (state, action) => {
            const purchasedIds = new Set(action.payload);
            state.cartItems = state.cartItems.filter((item) => !purchasedIds.has(item.productId));
            localStorage.setItem('cartItems', JSON.stringify(state.cartItems));
        },
        clearCart: (state) => {
            state.cartItems = [];
            localStorage.removeItem('cartItems');
        }
    },
});

export const { addToCart, updateQuantity, removeFromCart, clearPurchasedItems, clearCart } = cartSlice.actions;
export default cartSlice.reducer;