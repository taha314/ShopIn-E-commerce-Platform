const Product = require("../model/Product");
const cloudinary = require('../config/cloudinary');

// get all products
const getProducts = async (req, res) => {
    try {
        const products = await Product.find({});
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// get product by id
const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// create product
const createProduct = async (req, res) => {
    try {
        const { name, category, description, price, stock } = req.body;
        const stockValue = Number(stock);
        if (!Number.isInteger(stockValue) || stockValue < 0) {
            return res.status(400).json({ message: 'Stock must be a non-negative integer' });
        }
        let imageUrl = "";
        if (req.file) {
            const result = await cloudinary.uploader.upload(req.file.path);
            imageUrl = result.secure_url;
        }
        const product = new Product({
            name,
            category,
            description,
            price,
            stock: stockValue,
            imageUrl,
        });
        const savedProduct = await product.save();
        res.status(201).json(savedProduct);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// update product
const updateProduct = async (req, res) => {
    try {
        const { name, category, description, price, stock } = req.body;
        const stockValue = Number(stock);
        if (!Number.isInteger(stockValue) || stockValue < 0) {
            return res.status(400).json({ message: 'Stock must be a non-negative integer' });
        }
        const product = await Product.findById(req.params.id);
        if (product) {
            product.name = name || product.name;
            product.category = category || product.category;
            product.description = description || product.description;
            product.price = price || product.price;
            product.stock = stockValue;
            if (req.file) {
                const result = await cloudinary.uploader.upload(req.file.path);
                product.imageUrl = result.secure_url;
            }
            const updatedProduct = await product.save();
            res.json(updatedProduct);
        }
        else {
            res.status(404).json({ message: 'Product not found' });
        }

    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// delete product
const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (product) {
            res.json({ message: 'Product deleted' });
        }
        else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
};