const User = require("../model/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");

const generateToken = (id) => {
    return jwt.sign(
        { id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// 10 seconds for testing.
// Change to 60 * 1000 before production.
const OTP_RESEND_COOLDOWN_MS = 10 * 1000;

const createOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const getOtpEmail = (name, otp) => {
    return `
Welcome to ShopIn, ${name}!

Thank you for registering with us.

Your OTP for ShopIn Registration is: ${otp}

This OTP will expire in 10 minutes.

If you did not create this account, please ignore this email.

Thank you,
ShopIn Team
`;
};

const sendRegistrationOtp = (user, otp) => {
    return sendEmail({
        to: user.email,
        subject: "Welcome to ShopIn - Registration OTP",
        text: getOtpEmail(user.name, otp),
    });
};

const registerUser = async (req, res) => {
    try {
        const body =
            req.body && typeof req.body === "object"
                ? req.body
                : {};

        const name =
            typeof body.name === "string"
                ? body.name.trim()
                : "";

        const email =
            typeof body.email === "string"
                ? body.email.trim().toLowerCase()
                : "";

        const password =
            typeof body.password === "string"
                ? body.password
                : "";

        if (!name || !email || !password) {
            console.warn(
                "[Auth] Registration rejected: missing required fields"
            );

            return res.status(400).json({
                message:
                    "Name, email, and password are required",
            });
        }

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            console.warn(
                "[Auth] Registration rejected: invalid email format"
            );

            return res.status(400).json({
                message:
                    "Please provide a valid email address",
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                message:
                    "Password must be at least 6 characters long",
            });
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {

            if (existingUser.verified) {
                console.warn(
                    "[Auth] Registration rejected: verified email already registered"
                );

                return res.status(400).json({
                    message:
                        "An account with this email already exists. Please log in.",
                });
            }

            if (
                existingUser.otpLastSentAt &&
                Date.now() -
                    existingUser.otpLastSentAt.getTime() <
                    OTP_RESEND_COOLDOWN_MS
            ) {
                return res.status(429).json({
                    message:
                        "Please wait 10 seconds before requesting another verification code.",
                });
            }

            const previousOtp = existingUser.otp;
            const previousOtpExpires =
                existingUser.otpExpires;
            const previousOtpLastSentAt =
                existingUser.otpLastSentAt;

            const otp = createOtp();

            existingUser.otp = otp;
            existingUser.otpExpires = new Date(
                Date.now() + OTP_EXPIRY_MS
            );
            existingUser.otpLastSentAt = new Date();

            await existingUser.save();

            try {
                await sendRegistrationOtp(
                    existingUser,
                    otp
                );
            } catch (emailError) {

                // Restore previous OTP if email fails
                existingUser.otp = previousOtp;
                existingUser.otpExpires =
                    previousOtpExpires;
                existingUser.otpLastSentAt =
                    previousOtpLastSentAt;

                try {
                    await existingUser.save();
                } catch (restoreError) {
                    console.error(
                        "[Auth] OTP resend state restore failed:",
                        restoreError.message
                    );
                }

                console.error(
                    "[Auth] OTP resend delivery failed:",
                    emailError.message
                );

                return res.status(503).json({
                    message:
                        "We could not send your verification email. Please try again later.",
                });
            }

            return res.status(200).json({
                message:
                    "A new verification code has been sent to your email.",
                email: existingUser.email,
                verificationRequired: true,
            });
        }

        const salt = await bcrypt.genSalt(10);

        const hashedPassword =
            await bcrypt.hash(password, salt);

        const otp = createOtp();

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            verified: false,
            otp,
            otpExpires: new Date(
                Date.now() + OTP_EXPIRY_MS
            ),
            otpLastSentAt: new Date(),
        });

        if (!user) {
            console.error(
                "[Auth] Registration failed: user creation returned no user"
            );

            return res.status(400).json({
                message: "Invalid user data",
            });
        }

        try {
            await sendRegistrationOtp(user, otp);
        } catch (emailError) {

            try {
                await user.deleteOne();
            } catch (deleteError) {
                console.error(
                    "[Auth] Failed to remove user after email failure:",
                    deleteError.message
                );
            }

            console.error(
                "[Auth] Registration failed: OTP delivery error:",
                emailError.message
            );

            return res.status(503).json({
                message:
                    "We could not send your verification email. Please try again later.",
            });
        }

        return res.status(201).json({
            message:
                "Registration successful. Please check your email for the verification code.",
            email: user.email,
            verificationRequired: true,
        });

    } catch (error) {

        if (error?.code === 11000) {
            console.warn(
                "[Auth] Registration rejected: duplicate email"
            );

            return res.status(400).json({
                message: "User already exists",
            });
        }

        if (
            error?.name === "ValidationError" ||
            error?.name === "CastError"
        ) {
            console.warn(
                "[Auth] Database validation error:",
                error.message
            );

            return res.status(400).json({
                message: "Invalid registration data",
            });
        }

        console.error(
            "[Auth] Registration failed:",
            error.message
        );

        return res.status(500).json({
            message:
                "Unable to register at this time",
        });
    }
};

const loginUser = async (req, res) => {
    try {
        const email =
            typeof req.body.email === "string"
                ? req.body.email.trim().toLowerCase()
                : "";

        const password =
            typeof req.body.password === "string"
                ? req.body.password
                : "";

        if (!email || !password) {
            return res.status(400).json({
                message:
                    "Email and password are required",
            });
        }

        const user = await User.findOne({ email });

        if (
            user &&
            (await bcrypt.compare(
                password,
                user.password
            ))
        ) {

            if (!user.verified) {
                return res.status(403).json({
                    message:
                        "Please verify your email before logging in",
                });
            }

            return res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            });
        }

        return res.status(401).json({
            message: "Invalid email or password",
        });

    } catch (error) {

        console.error(
            "[Auth] Login failed:",
            error.message
        );

        return res.status(500).json({
            message:
                "Unable to login at this time",
        });
    }
};

const getUsers = async (req, res) => {
    try {
        const users = await User.find({})
            .select("-password");

        return res.json(users);

    } catch (error) {

        console.error(
            "[Auth] Get users failed:",
            error.message
        );

        return res.status(500).json({
            message:
                "Unable to fetch users",
        });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getUsers,
};