const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const key = Buffer.from(process.env.ENCRYPTION_KEY || '6035aef0b5994c4ee0b6576240ce5bcbdaac9bbce537f14ffa818c2540c20ab5', 'hex');
const iv = crypto.randomBytes(16);

const encrypt = (text) => {
    if (!text) return null;
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
};

const decrypt = (text) => {
    if (!text) return null;
    try {
        const [ivHex, encryptedText] = text.split(':');
        const decryptIv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, decryptIv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption failed:', error);
        return null;
    }
};

module.exports = { encrypt, decrypt };
