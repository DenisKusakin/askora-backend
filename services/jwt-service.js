import {jwtVerify, SignJWT} from "jose";
import pkg from "tweetnacl";
import {JWT_EXPIRATION_TIME, JWT_SECRET_KEY} from "../conf.js";

const {randomBytes, sign} = pkg;

export function generatePayload() {
    const payload = Buffer.from(randomBytes(32)).toString('hex')

    const encoder = new TextEncoder();
    const key = encoder.encode(JWT_SECRET_KEY);

    return new SignJWT({payload})
        .setProtectedHeader({alg: 'HS256'})
        .setIssuedAt()
        .setExpirationTime('45m')
        .sign(key)
}

export async function verifyToken(token) {
    const encoder = new TextEncoder();
    const key = encoder.encode(JWT_SECRET_KEY);
    try {
        const {payload} = await jwtVerify(token, key);
        return payload;
    } catch (e) {
        return null;
    }
}

export function generateToken(addr) {
    const encoder = new TextEncoder();
    const key = encoder.encode(JWT_SECRET_KEY);

    return new SignJWT({addr: addr.toRawString()})
        .setProtectedHeader({alg: 'HS256'})
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRATION_TIME)
        .sign(key)
}