/**
 * 백업 파일 잠그기와 열기 (wiki.backup.daily).
 *
 * 왜 공개 키로 잠그나요:
 * - 이 저장소는 공개라 GitHub Actions 아티팩트를 누구나 받을 수 있어요. 그래서 잠근 파일만 올려요.
 * - 비밀번호 하나로 잠그면 그 비밀번호를 Actions에 넣어야 하고, Actions가 뚫리면 지난 백업도 모두 열려요.
 *   공개 키로 잠그면 Actions에는 여는 열쇠가 없어요. 여는 개인 키는 받는 사람만 따로 보관해요.
 *
 * 방식: 백업마다 새 데이터 키(AES-256-GCM)로 내용을 잠그고, 그 데이터 키를 받는 사람마다 공개 키(RSA-OAEP, SHA-256)로 잠가요.
 * 받는 사람이 여럿이면 누구의 개인 키로든 열 수 있어요. 한 사람이 키를 잃어도 다른 사람이 열 수 있게 두 명 이상을 권해요.
 * Node에 들어 있는 node:crypto만 써요 (새 패키지 없음).
 */
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { z } from 'zod';
import { SilError } from '../errors.ts';

/** 잠근 백업 파일. 잠그지 않은 칸에는 DB 내용·주소가 들어가지 않아요 */
export interface EncryptedBackup {
  format: 'sil-backup-encrypted';
  version: 1;
  cipher: 'aes-256-gcm';
  keyWrap: 'rsa-oaep-sha256';
  /** 받는 사람마다 하나. keyId는 공개 키의 지문이에요 (backupKeyId) */
  recipients: { keyId: string; wrappedKey: string }[];
  /** 아래 세 칸은 base64 */
  iv: string;
  tag: string;
  data: string;
}

/** 이보다 짧은 RSA 키로는 잠그지 않아요 */
const MIN_RSA_BITS = 3072;
const AAD = Buffer.from('sil-backup-encrypted/1');

/** 백업 열쇠 한 쌍을 만들어요. 공개 키는 저장소에, 개인 키는 받는 사람만 보관해요 */
export function generateBackupKeyPair(): {
  publicKeyPem: string;
  privateKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: MIN_RSA_BITS,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/** 공개 키 지문 (SPKI DER의 SHA-256 앞 16글자). 개인 키에서 뽑아도 같은 값이에요 */
export function backupKeyId(key: KeyObject): string {
  const publicKey = key.type === 'private' ? createPublicKey(key) : key;
  return createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex')
    .slice(0, 16);
}

/**
 * 이 공개 키들로 잠글 수 있는지 미리 확인해요. 받는 사람이 없거나 맞지 않는 키가 있으면 에러를 던져요.
 * DB를 읽기 전에 부르면, 열쇠 문제로 실패할 때 DB를 괜히 읽지 않아요.
 */
export function checkBackupRecipients(publicKeyPems: string[]): void {
  if (publicKeyPems.length === 0) {
    throw new SilError(
      'VALIDATION_FAILED',
      '백업을 잠글 공개 키가 없어요. apps/cli/backup-keys/에 공개 키(.pub.pem)를 넣어 주세요 (sil backup-key).',
    );
  }
  for (const pem of publicKeyPems) readPublicKey(pem);
}

/** 내용을 받는 사람들의 공개 키로 잠가요. 받는 사람이 없으면 잠그지 않고 에러를 던져요 */
export function encryptBackup(
  plaintext: string,
  publicKeyPems: string[],
): EncryptedBackup {
  checkBackupRecipients(publicKeyPems);
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([
    cipher.update(gzipSync(Buffer.from(plaintext, 'utf8'))),
    cipher.final(),
  ]);
  const recipients = publicKeyPems.map((pem) => {
    const publicKey = readPublicKey(pem);
    return {
      keyId: backupKeyId(publicKey),
      wrappedKey: publicEncrypt(
        {
          key: publicKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        dataKey,
      ).toString('base64'),
    };
  });
  return {
    format: 'sil-backup-encrypted',
    version: 1,
    cipher: 'aes-256-gcm',
    keyWrap: 'rsa-oaep-sha256',
    recipients,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

/** 개인 키로 열어요. 이 파일을 잠근 공개 키의 짝이 아니거나 파일이 바뀌었으면 에러를 던져요 */
export function decryptBackup(
  envelope: EncryptedBackup,
  privateKeyPem: string,
): string {
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    throw new SilError(
      'VALIDATION_FAILED',
      '개인 키 파일을 읽지 못했어요. sil backup-key가 만든 .key.pem 파일인지 확인해 주세요.',
    );
  }
  const keyId = backupKeyId(privateKey);
  const recipient = envelope.recipients.find((item) => item.keyId === keyId);
  if (!recipient) {
    throw new SilError(
      'VALIDATION_FAILED',
      `이 개인 키(지문 ${keyId})로는 열 수 없는 백업이에요. 잠근 공개 키 지문: ${envelope.recipients.map((item) => item.keyId).join(', ')}`,
    );
  }
  try {
    const dataKey = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(recipient.wrappedKey, 'base64'),
    );
    const decipher = createDecipheriv(
      'aes-256-gcm',
      dataKey,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const zipped = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]);
    return gunzipSync(zipped).toString('utf8');
  } catch {
    throw new SilError(
      'VALIDATION_FAILED',
      '백업 파일을 열지 못했어요. 파일이 중간에 바뀌었거나 덜 받아진 것 같아요. 아티팩트를 다시 받아 주세요.',
    );
  }
}

const envelopeSchema = z.object({
  format: z.literal('sil-backup-encrypted'),
  version: z.literal(1),
  cipher: z.literal('aes-256-gcm'),
  keyWrap: z.literal('rsa-oaep-sha256'),
  recipients: z
    .array(z.object({ keyId: z.string(), wrappedKey: z.string() }))
    .min(1),
  iv: z.string(),
  tag: z.string(),
  data: z.string(),
});

/** 파일 내용이 잠근 백업 모양이면 true */
export function isEncryptedBackup(value: unknown): value is EncryptedBackup {
  return envelopeSchema.safeParse(value).success;
}

function readPublicKey(pem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey(pem);
  } catch {
    throw new SilError(
      'VALIDATION_FAILED',
      '공개 키 파일을 읽지 못했어요. sil backup-key가 만든 .pub.pem 파일인지 확인해 주세요.',
    );
  }
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (key.asymmetricKeyType !== 'rsa' || bits < MIN_RSA_BITS) {
    throw new SilError(
      'VALIDATION_FAILED',
      `백업 공개 키는 ${MIN_RSA_BITS}비트 이상의 RSA 키여야 해요 (sil backup-key로 만들어요).`,
    );
  }
  return key;
}
