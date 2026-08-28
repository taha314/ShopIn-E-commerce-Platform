const sendEmail = async ({ to, subject, text, html }) => {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
    const senderName = process.env.BREVO_SENDER_NAME?.trim() || "ShopIn";

    if (!to || !String(to).trim()) {
        throw new Error("Email recipient is required");
    }

    if (!apiKey || !senderEmail) {
        throw new Error("Brevo email service is not configured");
    }

    try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                accept: "application/json",
                "api-key": apiKey,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                sender: {
                    name: senderName,
                    email: senderEmail,
                },
                to: [
                    {
                        email: String(to).trim(),
                    },
                ],
                subject,
                textContent: text,
                ...(html ? { htmlContent: html } : {}),
            }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error("[Brevo] Email failed:", {
                status: response.status,
                code: data?.code,
                message: data?.message,
            });

            throw new Error(
                data?.message || "Brevo email service failed"
            );
        }

        console.log("[Brevo] Email sent successfully:", {
            recipient: to,
            messageId: data?.messageId,
        });

        return data;
    } catch (error) {
        console.error("[Brevo] Email delivery failed:", error.message);
        throw error;
    }
};

module.exports = sendEmail;