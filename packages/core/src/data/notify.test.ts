import { afterEach, describe, expect, it, vi } from 'vitest';
import { setDbForTesting, type DbClient } from './client.ts';
import { watchPendingChecks } from './notify.ts';

type SubscribeCallback = (status: string, error?: Error) => void;

/** subscribe에 넘긴 콜백을 꺼내 쓸 수 있는 가짜 Realtime 채널이에요 */
function createFakeRealtime() {
  let onStatus: SubscribeCallback = () => undefined;
  const channel = {
    on: () => channel,
    subscribe: (callback: SubscribeCallback) => {
      onStatus = callback;
      return channel;
    },
  };
  const client = {
    channel: () => channel,
    removeChannel: vi.fn(async () => 'ok'),
  } as unknown as DbClient;
  return {
    client,
    emit: (status: string, error?: Error) => onStatus(status, error),
  };
}

afterEach(() => setDbForTesting(undefined));

describe('watchPendingChecks', () => {
  it('끊겼다가 다시 연결되면 onChange를 불러서 새로 고치지 않아도 이어져요', () => {
    const realtime = createFakeRealtime();
    setDbForTesting(realtime.client);
    const onChange = vi.fn();
    const onError = vi.fn();
    watchPendingChecks({ recipient: '신지', onChange, onError });

    realtime.emit('SUBSCRIBED');
    expect(onChange).not.toHaveBeenCalled();

    realtime.emit('CHANNEL_ERROR', new Error('socket closed: 1006'));
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('socket closed: 1006'),
    );

    realtime.emit('SUBSCRIBED');
    expect(onChange).toHaveBeenCalledTimes(1);

    realtime.emit('SUBSCRIBED');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
