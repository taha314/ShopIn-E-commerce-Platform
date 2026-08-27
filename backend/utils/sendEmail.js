const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, text, html }) => {
    const sender = process.env.EMAIL_USER?.trim();
    const password = process.env.EMAIL_PASS?.trim();

    if (!to || !String(to).trim()) {
        throw new Error('Email recipient is required');
    }
    if (!sender || !password) {
        throw new Error('Email service is not configured');
    }

    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: sender,
                pass: password
            },
        });
        await transporter.sendMail({
            from: sender,
            to: String(to).trim(),
            subject,
            text,
            html,
        });
    } catch (error) {
        console.error('Email delivery failed:', error.code || error.message);
        throw new Error('Unable to send email');
    }
};

module.exports = sendEmail;
