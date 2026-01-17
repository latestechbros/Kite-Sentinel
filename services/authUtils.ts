
/**
 * Simple TOTP (RFC 6238) implementation using Web Crypto API
 */
export class TOTPUtils {
  private static base32ToUint8Array(base32: string): Uint8Array {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (let i = 0; i < base32.length; i++) {
      const val = alphabet.indexOf(base32[i].toUpperCase());
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    return new Uint8Array(bytes);
  }

  static async generateTOTP(secret: string): Promise<{ code: string; timeLeft: number }> {
    try {
      if (!secret || secret.length < 8) return { code: '------', timeLeft: 0 };
      
      const key = this.base32ToUint8Array(secret);
      const epoch = Math.round(Date.now() / 1000);
      const time = Math.floor(epoch / 30);
      const timeLeft = 30 - (epoch % 30);

      const timeBuffer = new ArrayBuffer(8);
      const timeView = new DataView(timeBuffer);
      timeView.setUint32(4, time); // Set lower 32 bits

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: { name: 'SHA-1' } },
        false,
        ['sign']
      );

      const signature = await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
      const hmac = new Uint8Array(signature);
      const offset = hmac[hmac.length - 1] & 0xf;
      const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

      return {
        code: (code % 1000000).toString().padStart(6, '0'),
        timeLeft
      };
    } catch (e) {
      console.error("TOTP Error:", e);
      return { code: 'ERROR', timeLeft: 0 };
    }
  }
}
