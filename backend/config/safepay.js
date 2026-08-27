const getTrimmedEnv = (...names) => {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return undefined;
};

const getSafepayConfig = () => ({
    // The aliases preserve compatibility with the variable names already used locally.
    apiKey: getTrimmedEnv('SAFEPAY_API_KEY', 'SAFEPAY_KEY_ID'),
    secretKey: getTrimmedEnv('SAFEPAY_SECRET_KEY', 'SAFERPAY_KEY_SECRET'),
    webhookSecret: getTrimmedEnv('SAFEPAY_WEBHOOK_SECRET'),
    environment: getTrimmedEnv('SAFEPAY_ENV') || 'sandbox',
    clientUrl: getTrimmedEnv('CLIENT_URL') || 'http://localhost:3000'
});

const getMissingSafepayConfig = (config, names) => names.filter((name) => {
    const values = {
        SAFEPAY_API_KEY: config.apiKey,
        SAFEPAY_SECRET_KEY: config.secretKey,
        SAFEPAY_WEBHOOK_SECRET: config.webhookSecret
    };
    return !values[name];
});

const logSafepayConfig = () => {
    if (process.env.NODE_ENV === 'production') return;

    const config = getSafepayConfig();
    console.log('Safepay configuration:');
    console.log(`API key: ${config.apiKey ? 'configured' : 'missing'}`);
    console.log(`Secret key: ${config.secretKey ? 'configured' : 'missing'}`);
    console.log(`Webhook secret: ${config.webhookSecret ? 'configured' : 'missing'}`);
    console.log(`Environment: ${config.environment}`);
};

module.exports = { getSafepayConfig, getMissingSafepayConfig, logSafepayConfig };
