const User = require("../model/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");


const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 10 * 1000;

const createOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const getOtpEmail = (name, otp) => `
            Welcome to ShopIn, ${name}!

            Thank you for registering with us.

            Your OTP for ShopIn Registration is: ${otp}

            This OTP will expire in 10 minutes.`;

const sendRegistrationOtp = (user, otp) => sendEmail({
    to: user.email,
    subject: 'Welcome to ShopIn - Registration OTP',
    text: getOtpEmail(user.name, otp)
});

// register a user
const registerUser = async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body.password === 'string' ? body.password : '';

        if (!name || !email || !password) {
            console.warn('[Auth] Registration rejected: missing required fields');
            return res.status(400).json({ message: 'Name, email, and password are required' });
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            console.warn('[Auth] Registration rejected: invalid email format');
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            if (existingUser.verified) {
                console.warn('[Auth] Registration rejected: verified email already registered');
                return res.status(400).json({ message: 'An account with this email already exists. Please log in.' });
            }

            if (existingUser.otpLastSentAt
                && Date.now() - existingUser.otpLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
                return res.status(429).json({ message: 'Please wait a minute before requesting another verification code.' });
            }

            const previousOtp = existingUser.otp;
            const previousOtpExpires = existingUser.otpExpires;
            const previousOtpLastSentAt = existingUser.otpLastSentAt;
            const otp = createOtp();

            existingUser.otp = otp;
            existingUser.otpExpires = new Date(Date.now() + OTP_EXPIRY_MS);
            existingUser.otpLastSentAt = new Date();
            await existingUser.save();

            try {
                await sendRegistrationOtp(existingUser, otp);
            } catch (emailError) {
                existingUser.otp = previousOtp;
                existingUser.otpExpires = previousOtpExpires;
                existingUser.otpLastSentAt = previousOtpLastSentAt;
                try {
                    await existingUser.save();
                } catch (restoreError) {
                    console.error('[Auth] OTP resend state restore failed', { name: restoreError?.name, code: restoreError?.code });
                }
                console.error('[Auth] OTP resend delivery failed', { name: emailError?.name, code: emailError?.code });
                return res.status(503).json({ message: 'We could not send your verification email. Please try again later.' });
            }

            return res.status(200).json({
                message: 'A new verification code has been sent to your email.',
                email: existingUser.email,
                verificationRequired: true,
            });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const otp = createOtp();

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            verified: false,
            otp,
            otpExpires: new Date(Date.now() + OTP_EXPIRY_MS),
            otpLastSentAt: new Date(),
        });
        if (user) {
            try {
                await sendRegistrationOtp(user, otp);
            } catch (emailError) {
                await user.deleteOne();
                console.error('[Auth] Registration failed: OTP delivery error', { name: emailError?.name, code: emailError?.code });
                return res.status(503).json({ message: 'We could not send your verification email. Please try again later.' });
            }

            return res.status(201).json({
                message: 'Registration successful. Please check your email for the verification code.',
                email: user.email,
                verificationRequired: true,
            });
        }
        else {
            console.error('[Auth] Registration failed: user creation returned no user');
            return res.status(400).json({ message: "Invalid user data" });
        }
    } catch (error) {
        if (error?.code === 11000) {
            console.warn('[Auth] Registration rejected: duplicate email');
            return res.status(400).json({ message: 'User already exists' });
        }
        if (error?.name === 'ValidationError' || error?.name === 'CastError') {
            console.warn('[Auth] Registration rejected: database validation error', { name: error.name });
            return res.status(400).json({ message: 'Invalid registration data' });
        }
        console.error('[Auth] Registration failed: server or database error', { name: error?.name, code: error?.code });
        return res.status(500).json({ message: 'Unable to register at this time' });
    }
};

// login a user
const loginUser = async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }
    try {
        const user = await User.findOne({ email });
        if (user && (await bcrypt.compare(password, user.password))) {
            if (!user.verified) {
                return res.status(403).json({ message: "Please verify your email before logging in" });
            }

            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            });
        }
        else {
            return res.status(401).json({ message: "Invalid email or password" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getUsers = async (req, res) => {
    try {
        const users = (await User.find({})).select("-password");
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { registerUser, loginUser, getUsers };
