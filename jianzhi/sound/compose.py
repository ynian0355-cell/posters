"""
掌中展开 · 声音样片（33 秒，和自动演示的分镜一一对应）

方向：高级、克制、带一点酷。不用沙沙声，不用任何采样，全部用数学合成：
  - 底：很低很轻的持续音（D 的根音 + 五度），像空间本身在呼吸
  - 觉醒：极高、极轻的细碎"光点"声，像粒子一颗颗亮起
  - 蓄力：低频慢慢涨起来，一条被滤过的气流往上推，音高一点点升高
  - 展开：一声很深的"嗡"（不是爆炸），带一个宽阔的和弦尾巴
  - 结印：五声玻璃般的钟音，按 宫 商 角 徵 羽（D E F# A B）一枚一枚往上走，左右声像跟着团花的位置
  - 汇聚：五个音不再消失，连成一片和声慢慢涨起来
  - 显形：和声缓慢旋转（左右来回），细碎光点越来越密
  - 定格：落到一个温暖的大和弦上，慢慢呼吸、淡出
  - 折回：一声反向的钟音，回到安静

用法：python3 compose.py 输出 jianzhi_sound.wav（48kHz 立体声）
"""
import numpy as np
import wave, sys

SR = 48000
DUR = 33.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
t_all = np.arange(N) / SR


def note(f):
    return f


D2, A2, D3, A3, D4 = 73.42, 110.0, 146.83, 220.0, 293.66
PENTA = [587.33, 659.25, 739.99, 880.0, 987.77]          # D5 E5 F#5 A5 B5：宫 商 角 徵 羽


def place(sig, t0, pan=0.0, gain=1.0):
    """把一段声音放到 t0 秒处；pan -1 左 … 1 右（等功率）"""
    i0 = int(t0 * SR)
    n = min(len(sig), N - i0)
    if n <= 0:
        return
    a = (pan + 1) * np.pi / 4
    L[i0:i0 + n] += sig[:n] * np.cos(a) * gain
    R[i0:i0 + n] += sig[:n] * np.sin(a) * gain


def env_adsr(n, a, d_tau):
    t = np.arange(n) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    return att * np.exp(-np.maximum(t - a, 0) / d_tau)


def bell(f, dur=4.0, idx=1.6, ratio=3.5, tau=1.4):
    """玻璃钟音：FM 合成，调制深度随时间衰减，所以起音亮、尾巴干净"""
    n = int(dur * SR); t = np.arange(n) / SR
    I = idx * np.exp(-t / 0.35)
    s = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * ratio * t))
    s += 0.25 * np.sin(2 * np.pi * f * 2.001 * t) * np.exp(-t / 0.6)
    return s * env_adsr(n, 0.004, tau)


def pad(freqs, dur, attack, release, detune=0.15):
    """柔和的和声垫：每个音两三根略微走调的正弦，慢慢起、慢慢收"""
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for d in (-detune, 0, detune):
            s += np.sin(2 * np.pi * (f + d) * t + rng.uniform(0, 6.28))
    s /= (len(freqs) * 3)
    e = np.clip(t / attack, 0, 1) ** 2 * np.clip((dur - t) / release, 0, 1)
    return s * e


def lowpass(x, cutoff):
    """一阶低通，cutoff 可以是随时间变化的数组"""
    y = np.zeros_like(x); c = np.broadcast_to(cutoff, x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc); y[i] = acc
    return y


def shimmer(t0, dur, density, fmin=2400, fmax=6200, gain=0.05, grow=False):
    """细碎光点：很多极短的高频小正弦颗粒，左右随机"""
    k = int(density * dur)
    for j in range(k):
        u = rng.random()
        if grow:
            u = u ** 0.5                                   # 越往后越密
        at = t0 + u * dur
        f = rng.uniform(fmin, fmax); n = int(SR * rng.uniform(0.04, 0.12)); t = np.arange(n) / SR
        g = np.sin(2 * np.pi * f * t) * np.sin(np.pi * t / t[-1]) ** 2
        place(g, at, rng.uniform(-0.9, 0.9), gain * rng.uniform(0.4, 1))


# ---------------- 底：持续低音（全程，很轻） ----------------
breath = 0.75 + 0.25 * np.sin(2 * np.pi * t_all / 9.0)
drone = (np.sin(2 * np.pi * D2 * t_all) + 0.5 * np.sin(2 * np.pi * A2 * t_all + 1) + 0.25 * np.sin(2 * np.pi * D3 * 1.002 * t_all)) * breath
fade = np.clip(t_all / 2.0, 0, 1) * np.clip((DUR - t_all) / 2.0, 0, 1)
L += drone * fade * 0.035; R += drone * fade * 0.035

# ---------------- 01 觉醒 2.5s ----------------
shimmer(2.5, 2.5, 22, gain=0.035)
place(pad([D4 * 2, A3 * 2], 3.0, 1.2, 1.5), 2.5, 0, 0.05)

# ---------------- 02 蓄力 5.0 → 7.6（不用噪声：几根正弦叠起来，音高慢慢往上推，脉动越来越快） ----------------
n = int(2.6 * SR); t = np.arange(n) / SR; u = t / 2.6
pulse = 0.65 + 0.35 * np.sin(2 * np.pi * np.cumsum(1.5 + 9 * u ** 2) / SR)    # 心跳一样，越握越快
rise = np.zeros(n)
for k, (fq, g) in enumerate([(D3, 1.0), (A3, 0.6), (D4, 0.45), (A3 * 2, 0.25)]):
    f = fq * (1 + 0.06 * u ** 2)
    rise += g * np.sin(2 * np.pi * np.cumsum(f) / SR + k)
rise *= u ** 2.2 * pulse
sub = np.sin(2 * np.pi * 55 * t) * u ** 2
place(rise, 5.0, -0.25, 0.05)
place(rise, 5.0, 0.25, 0.05)
place(sub, 5.0, 0, 0.10)

# ---------------- 03 展开 7.6 ----------------
n = int(4.5 * SR); t = np.arange(n) / SR
boom = np.sin(2 * np.pi * (62 * np.exp(-t / 0.5) + 38) * t) * env_adsr(n, 0.01, 0.9)
place(boom, 7.6, 0, 0.24)
for k, fq in enumerate([D3, A3, D4, PENTA[2] / 2, PENTA[0]]):
    place(bell(fq, 5.0, idx=0.8, tau=2.2), 7.62 + k * 0.012, (k - 2) * 0.35, 0.05)
shimmer(7.6, 1.6, 40, gain=0.03)

# ---------------- 04 结印 10.6, 11.8, 13.0, 14.2, 15.4 ----------------
pans = [0.0, 0.8, 0.5, -0.5, -0.8]                     # 团花的位置：上、右、右下、左下、左
for k, (fq, at) in enumerate(zip(PENTA, [10.6, 11.8, 13.0, 14.2, 15.4])):
    place(bell(fq, 5.0, idx=1.4, tau=1.6), at, pans[k], 0.11)
    place(bell(fq / 2, 4.0, idx=0.5, tau=1.2), at + 0.004, pans[k] * 0.5, 0.05)

# ---------------- 05 汇聚 17.0 ----------------
place(pad(PENTA, 6.5, 2.0, 2.5), 17.0, -0.15, 0.10)
place(pad([D3, A3], 6.5, 2.4, 2.5), 17.0, 0.15, 0.10)

# ---------------- 06 显形 19.4 → 23.5（和声左右慢慢转） ----------------
n = int(5.5 * SR); t = np.arange(n) / SR
swirl = pad([D4, PENTA[2] / 2 * 2, A3 * 2, PENTA[4]], 5.5, 1.5, 1.6)
pan_lfo = np.sin(2 * np.pi * t * (0.3 + 0.25 * t / 5.5))
i0 = int(19.4 * SR)
L[i0:i0 + n] += swirl * (0.5 - 0.5 * pan_lfo) * 0.14
R[i0:i0 + n] += swirl * (0.5 + 0.5 * pan_lfo) * 0.14
shimmer(19.4, 4.1, 45, gain=0.03, grow=True)

# ---------------- 07 定格 23.5 ----------------
place(pad([D2, D3, A3, PENTA[2] / 2, D4], 8.0, 0.4, 5.0, detune=0.1), 23.5, 0, 0.22)
place(bell(D4, 6.0, idx=0.6, tau=3.0), 23.5, 0, 0.06)

# ---------------- 折回 31.0：反向的钟音，回到安静 ----------------
rb = bell(PENTA[0], 1.4, idx=1.0, tau=0.6)[::-1]
place(rb, 31.0 - 0.2, 0, 0.06)

# ---------------- 空间：简单的卷积混响（每边一条不同的衰减噪声） ----------------
def reverb(x, seconds=3.2, seed=1):
    r = np.random.default_rng(seed)
    n = int(seconds * SR); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t / (seconds / 6.5))
    ir = lowpass(ir, 5200) ; ir /= np.sqrt(np.sum(ir ** 2))
    m = len(x) + n - 1; F = 1 << (m - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[:len(x)]
    return y

wet = 0.38
Lo = L * (1 - wet) + reverb(L, seed=1) * wet
Ro = R * (1 - wet) + reverb(R, seed=2) * wet
mx = max(np.max(np.abs(Lo)), np.max(np.abs(Ro)))
Lo = Lo / mx * 0.85; Ro = Ro / mx * 0.85                 # 留余量，不削波

out = sys.argv[1] if len(sys.argv) > 1 else 'jianzhi_sound.wav'
pcm = (np.stack([Lo, Ro], 1) * 32767).astype(np.int16)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', out)
