const getTrimmedEnv = (name) => process.env[name]?.trim() || undefined;

const getSafepayConfig = () => ({
    apiKey: getTrimmedEnv('SAFEPAY_API_KEY'),
    secretKey: getTrimmedEnv('SAFEPAY_SECRET_KEY'),
    webhookSecret: getTrimmedEnv('SAFEPAY_WEBHOOK_SECRET'),
    environment: getTrimmedEnv('SAFEPAY_ENV') || 'sandbox',
    clientUrl: getTrimmedEnv('CLIENT_URL') || 'http://localhost:3000'
});

const getLegacySafepayVariables = () => [
    'SAFEPAY_KEY_ID',
    'SAFERPAY_KEY_SECRET'
].filter((name) => getTrimmedEnv(name));

const getMissingSafepayConfig = (config, names) => names.filter((name) => {
    const values = {
        SAFEPAY_API_KEY: config.apiKey,
        SAFEPAY_SECRET_KEY: config.secretKey,
        SAFEPAY_WEBHOOK_SECRET: config.webhookSecret
    };
    return !values[name];
});

const logSafepayConfig = () => {
    const legacyVariables = getLegacySafepayVariables();
    if (process.env.NODE_ENV === 'production') {
        if (legacyVariables.length) {
            console.warn(`Ignoring unsupported Safepay environment variables: ${legacyVariables.join(', ')}`);
        }
        return;
    }

    const config = getSafepayConfig();
    console.log('Safepay configuration:');
    console.log(`API key: ${config.apiKey ? 'configured' : 'missing'}`);
    console.log(`Secret key: ${config.secretKey ? 'configured' : 'missing'}`);
    console.log(`Webhook secret: ${config.webhookSecret ? 'configured' : 'missing'}`);
    console.log(`Environment: ${config.environment}`);
    if (legacyVariables.length) {
        console.warn(`Ignoring unsupported Safepay environment variables: ${legacyVariables.join(', ')}`);
    }
};

module.exports = { getSafepayConfig, getLegacySafepayVariables, getMissingSafepayConfig, logSafepayConfig };
