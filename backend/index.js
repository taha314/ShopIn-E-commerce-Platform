require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const { logSafepayConfig } = require('./config/safepay');

logSafepayConfig();

connectDB();

const app = express();

app.use(cors());
app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = buffer.toString(); } }));
app.use(express.urlencoded({ extended: true }))

app.get("/", (req, res) => {
    res.send("ShopIn Backend is running");
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));



const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});