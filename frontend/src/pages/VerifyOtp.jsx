import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../styles/auth.css';

const VerifyOtp = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState(location.state?.email || '');
    const [otp, setOtp] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (event) => {
        event.preventDefault();
        setMessage('');
        setError('');

        try {
            const response = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp })
            });
            const data = await response.json();

            if (!response.ok) {
                setError(data.message || 'Unable to verify OTP.');
                return;
            }

            setMessage('Email verified successfully. Redirecting to login...');
            setTimeout(() => navigate('/login'), 1000);
        } catch (requestError) {
            console.error(requestError);
            setError('Unable to verify OTP. Please try again.');
        }
    };

    return (
        <div className="auth-container">
            <form onSubmit={handleSubmit} className="auth-form">
                <h2>Verify Your Email</h2>
                <p>Enter the OTP sent to your email address.</p>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                />
                <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength="6"
                    placeholder="6-digit OTP"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                    required
                />
                {error && <p className="auth-error">{error}</p>}
                {message && <p className="auth-success">{message}</p>}
                <button type="submit" className="btn">Verify OTP</button>
                <p>Already verified? <Link to="/login">Login</Link></p>
            </form>
        </div>
    );
};

export default VerifyOtp;