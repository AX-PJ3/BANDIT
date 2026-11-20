import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  backupKeyId,
  checkBackupRecipients,
  decryptBackup,
  encryptBackup,
  generateBackupKeyPair,
  isEncryptedBackup,
} from './backup-crypto.ts';

describe('백업 잠그기', () => {
  let alice: ReturnType<typeof generateBackupKeyPair>;
  let bob: ReturnType<typeof generateBackupKeyPair>;
  beforeAll(() => {
    alice = generateBackupKeyPair();
    bob = generateBackupKeyPair();
  });

  it('받는 사람 누구의 개인 키로든 열려요', () => {
    const envelope = encryptBackup('{"한글":"값"}', [
      alice.publicKeyPem,
      bob.publicKeyPem,
    ]);
    expect(isEncryptedBackup(envelope)).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain('한글');
    expect(decryptBackup(envelope, alice.privateKeyPem)).toBe('{"한글":"값"}');
    expect(decryptBackup(envelope, bob.privateKeyPem)).toBe('{"한글":"값"}');
    expect(envelope.recipients.map((item) => item.keyId)).toEqual([
      backupKeyId(createPrivateKey(alice.privateKeyPem)),
      backupKeyId(createPrivateKey(bob.privateKeyPem)),
    ]);
  });

  it('받는 사람이 아닌 개인 키로는 열지 못해요', () => {
    const envelope = encryptBackup('비밀', [alice.publicKeyPem]);
    expect(() => decryptBackup(envelope, bob.privateKeyPem)).toThrow(
      /열 수 없는 백업/,
    );
  });

  it('파일이 한 글자라도 바뀌면 열지 않아요', () => {
    const envelope = encryptBackup('비밀', [alice.publicKeyPem]);
    const data = Buffer.from(envelope.data, 'base64');
    data[0] = data[0]! ^ 1;
    expect(() =>
      decryptBackup(
        { ...envelope, data: data.toString('base64') },
        alice.privateKeyPem,
      ),
    ).toThrow(/중간에 바뀌었거나/);
  });

  it('공개 키가 없거나 짧으면 잠그지 않아요', () => {
    expect(() => encryptBackup('비밀', [])).toThrow(/공개 키가 없어요/);
    const weak = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    expect(() => encryptBackup('비밀', [weak.publicKey])).toThrow(/3072비트/);
  });

  it('checkBackupRecipients는 잠그기 전에 같은 이유로 미리 거절해요', () => {
    expect(() => checkBackupRecipients([])).toThrow(/공개 키가 없어요/);
    expect(() => checkBackupRecipients(['공개 키가 아닌 글자'])).toThrow(
      /공개 키 파일을 읽지 못했어요/,
    );
    expect(() => checkBackupRecipients([alice.publicKeyPem])).not.toThrow();
  });
});
