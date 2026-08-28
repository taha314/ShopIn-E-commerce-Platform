const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            console.error('Database connection failed: MONGO_URI is not configured');
            process.exit(1);
        }
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log("Database connected");        
    } catch (error) {
        console.error('Database connection failed', { name: error?.name, code: error?.code });
        process.exit(1);
    }
};

module.exports = connectDB;
