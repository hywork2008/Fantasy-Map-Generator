# Simulation Lab — インフラ構築手順書（Ubuntu ノート 2 台）

**Status**: runbook（`simulation-lab.md` §8 の具体化。§2〜§3 は今すぐ実行可能、§5 は Lab 実装（L1）後に有効）
**Date**: 2026-07-14
**Related**: `docs/plan/simulation-lab.md`

---

## 0. 前提と構成

### 0.1 ハードウェア / OS

| ホスト名（本書での呼称） | OS | RAM | 役割（`simulation-lab.md` §8.2） |
| :--- | :--- | :--- | :--- |
| `fmg-lab-a` | Ubuntu 24.04 LTS | 64GB | lab-api + workers（常時） |
| `fmg-lab-b` | Ubuntu 26.04 LTS | 64GB | lab-api + workers（負荷時）/ ETL + MariaDB |
| 操作端末 | （開発機） | — | CLI・本手順書の実行元 |

### 0.2 前提条件

- ノート 2 台は `~/.ssh` を共有済みで、**相互に認証なしで `ssh` 接続できる**
- 操作端末からも両ホストへ鍵認証で入れること（未設定なら `ssh-copy-id <user>@<host>` を先に実行）
- 各ホストで `sudo` が使えるアカウントであること
- LAN 内は固定 IP または DHCP 予約を推奨（以降 `192.168.x.10` / `192.168.x.11` をプレースホルダとして使う）

### 0.3 名前解決（操作端末と各ホストの `/etc/hosts`）

```bash
sudo tee -a /etc/hosts <<'EOF'
192.168.x.10  fmg-lab-a
192.168.x.11  fmg-lab-b
EOF
```

以降のコマンドは **操作端末から実行する前提**で記述する。ループ用の変数:

```bash
export LAB_HOSTS="fmg-lab-a fmg-lab-b"
```

---

## 1. SSH まわりの整備（非 sudo）

### 1.1 操作端末の `~/.ssh/config`

```text
Host fmg-lab-a
  HostName 192.168.x.10
  User <user>

Host fmg-lab-b
  HostName 192.168.x.11
  User <user>
```

### 1.2 疎通確認

```bash
for h in $LAB_HOSTS; do ssh $h 'echo "$(hostname): $(. /etc/os-release && echo $PRETTY_NAME)"'; done
```

### 1.3 リモート sudo の方式（どちらかを選ぶ）

| 方式 | やり方 | 備考 |
| :--- | :--- | :--- |
| **A. 対話式（推奨）** | `ssh -t <host> 'sudo bash -s' < script.sh` | `-t` で TTY を確保しパスワードを都度入力。安全 |
| B. NOPASSWD | 下記 drop-in を各ホストで 1 回設定 | 無人一括実行が可能になるが、**鍵が漏れると root 相当**。個人 LAN 機であることを理解の上で |

```bash
# 方式 B（任意・各ホストで直接実行）
echo "$USER ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/90-fmg-lab
sudo chmod 0440 /etc/sudoers.d/90-fmg-lab
```

以降の §2 は方式 A の形（`ssh -t <host> 'sudo bash -s' <<'EOF' ... EOF`）で記載する。

---

## 2. sudo フェーズ — OS 土台構築（各ホスト 1 回）

§2.1〜§2.6 を **`fmg-lab-a` と `fmg-lab-b` の両方**に適用する。まとめて流す場合:

```bash
for h in $LAB_HOSTS; do ssh -t $h 'sudo bash -s' < scripts/lab/provision-host.sh; done
# （provision-host.sh は §2.1〜§2.6 を連結したもの。ファイル化は任意）
```

### 2.1 基本パッケージ

```bash
ssh -t fmg-lab-a 'sudo bash -s' <<'EOF'
apt-get update
apt-get install -y curl git rsync jq ripgrep zstd htop tmux
EOF
```

### 2.2 ラップトップのサーバー化（蓋閉じ・サスペンド禁止）

**これを忘れると蓋を閉じた瞬間に run が止まる。** 最重要。

```bash
ssh -t fmg-lab-a 'sudo bash -s' <<'EOF'
mkdir -p /etc/systemd/logind.conf.d
tee /etc/systemd/logind.conf.d/99-fmg-lab.conf <<'CONF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
CONF
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
systemctl restart systemd-logind
EOF
```

補足:

- `sleep.target` 等の mask により、GDM ログイン画面の自動サスペンド（デスクトップ版 Ubuntu の既知の罠）も封じられる
- `systemd-logind` の再起動で物理コンソールのセッションが切れる場合がある。SSH セッションには影響しない。不安なら再起動で反映してもよい
- 電源は AC 接続を常態とする（バッテリー運用は想定しない）

### 2.3 Docker Engine（公式リポジトリ）

Ubuntu 26.04 は Docker の apt リポジトリに **リリース直後はチャンネルが無い場合がある**ため、codename を検出して無ければ `noble` にフォールバックする:

```bash
ssh -t fmg-lab-a 'sudo bash -s' <<'EOF'
set -e
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
if ! curl -fsIL "https://download.docker.com/linux/ubuntu/dists/${codename}/Release" >/dev/null 2>&1; then
  echo "Docker repo has no ${codename} channel; falling back to noble"
  codename=noble
fi

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
EOF
```

### 2.4 docker グループ（非 sudo で docker を使う）

```bash
ssh -t fmg-lab-a 'sudo usermod -aG docker $USER'
```

**反映には再ログインが必要**（既存 SSH セッションでは効かない）。以降の検証前に一度 SSH を張り直すこと。

### 2.5 データディレクトリ（SSD 側・永続用）

hot な Run Store は compose の tmpfs に置く（`simulation-lab.md` §8.1）ため、ホスト側 SSD には **アーカイブと DB だけ**を置く:

```bash
ssh -t fmg-lab-a 'sudo bash -s' <<'EOF'
mkdir -p /srv/fmg-lab/archive
chown -R $SUDO_USER: /srv/fmg-lab
EOF
```

（代替: compose の tmpfs を使わずホスト側に tmpfs を常設したい場合のみ `/etc/fstab` に
`tmpfs /mnt/fmg-lab-tmp tmpfs size=24G,mode=0770,uid=<uid>,gid=<gid> 0 0` を追記。通常は不要）

### 2.6 ファイアウォール（任意・ufw を使う場合のみ）

```bash
ssh -t fmg-lab-a 'sudo bash -s' <<'EOF'
ufw allow OpenSSH
ufw allow from 192.168.x.0/24 to any port 8080 proto tcp   # Lab API
ufw enable
EOF

# MariaDB を載せるホスト（B）だけ追加:
ssh -t fmg-lab-b 'sudo ufw allow from 192.168.x.0/24 to any port 3306 proto tcp'
```

サブネットは実環境に合わせる。ufw を使わないならこの節は丸ごと省略可。

### 2.7 時刻同期の確認（ログの時系列整合に必要）

```bash
for h in $LAB_HOSTS; do ssh $h 'timedatectl show -p NTPSynchronized -p Timezone'; done
# NTPSynchronized=yes であること。no なら: sudo timedatectl set-ntp true
```

---

## 3. 検証（sudo フェーズ完了後）

**SSH を張り直してから**（§2.4 の docker グループ反映のため）:

```bash
for h in $LAB_HOSTS; do
  echo "=== $h ==="
  ssh $h 'docker run --rm hello-world >/dev/null && echo "docker: OK"'
  ssh $h 'docker compose version'
done
```

Playwright 実行イメージの取得と Chromium の存在確認（タグは本リポジトリの `@playwright/test` バージョンに合わせる — 現在 `^1.61.1`）:

```bash
for h in $LAB_HOSTS; do
  ssh $h 'docker pull mcr.microsoft.com/playwright:v1.61.1-noble &&
          docker run --rm mcr.microsoft.com/playwright:v1.61.1-noble ls /ms-playwright'
done
```

ここまで通れば **インフラは準備完了**。以降は Lab 本体の実装（`simulation-lab.md` §11 の L1）が揃ってから。

---

## 4. Ubuntu 24.04 / 26.04 の差分メモ

| 項目 | 24.04 (noble) | 26.04 | 対処 |
| :--- | :--- | :--- | :--- |
| Docker apt リポジトリ | `noble` チャンネルあり | リリース直後は無い場合あり | §2.3 のフォールバックが吸収 |
| systemd / logind | 同等 | 同等 | 差分なし（§2.2 共通） |
| ufw / timedatectl | 同等 | 同等 | 差分なし |

コンテナ内はどちらも `noble` ベースの Playwright イメージで統一されるため、**ホスト OS の差はシミュレーション結果に影響しない**。

---

## 5. アプリ配置（Lab 実装 L1 以降・非 sudo）

> この節のパス（`docker/lab/Dockerfile` 等）は実装時に確定する。ここでは運用の型だけ固定する。

### 5.1 リポジトリ配布（操作端末 → 各ホスト）

プライベートリポジトリ前提のため rsync で配る（`node_modules` / `.git` は除外し、各ホストでビルド）:

```bash
for h in $LAB_HOSTS; do
  rsync -az --delete --exclude node_modules --exclude .git \
    ~/Projects/Fantasy-Map-Generator/ $h:~/fmg-lab/src/
done
```

### 5.2 イメージビルドと起動

```bash
for h in $LAB_HOSTS; do
  ssh $h 'cd ~/fmg-lab/src && docker build -t fmg-lab:latest -f docker/lab/Dockerfile .'
done

# 起動（compose 定義は simulation-lab.md §8.1。restart: unless-stopped を付け、
# §2.3 で docker.service を enable 済みなので再起動後も自動復帰する）
ssh fmg-lab-a 'cd ~/fmg-lab/src/docker/lab && FMG_LAB_TOKEN=<token> docker compose up -d lab-api'
ssh fmg-lab-b 'cd ~/fmg-lab/src/docker/lab && FMG_LAB_TOKEN=<token> docker compose --profile analytics up -d'
```

### 5.3 ヘルスチェック

```bash
export FMG_LAB_TOKEN=<token>
curl -fsS -H "Authorization: Bearer $FMG_LAB_TOKEN" http://fmg-lab-a:8080/runs && echo OK
curl -fsS -H "Authorization: Bearer $FMG_LAB_TOKEN" http://fmg-lab-b:8080/runs && echo OK
```

---

## 6. 日常運用コマンド集

```bash
# 状態確認
for h in $LAB_HOSTS; do echo "=== $h ==="; ssh $h 'docker ps --format "table {{.Names}}\t{{.Status}}"; df -h /srv/fmg-lab; free -h | head -2'; done

# 興味のある run をアーカイブへ退避（tmpfs → SSD; コンテナ内 Run Store は API/CLI の export を使う）
fmg-lab run export <runId> /srv/fmg-lab/archive/<runId>.tar.zst   # 実装後

# ホスト間収集（相互 SSH 鍵を活用: B が A から吸い上げる）
ssh fmg-lab-b 'rsync -az fmg-lab-a:/srv/fmg-lab/archive/ /srv/fmg-lab/archive/'

# アプリ更新（コード変更後）
#   §5.1 の rsync → §5.2 の build → compose up -d（再作成される）

# 停止
for h in $LAB_HOSTS; do ssh $h 'cd ~/fmg-lab/src/docker/lab && docker compose down'; done

# ホスト再起動（tmpfs 上の run は消える — 必要なものは先に export）
ssh -t fmg-lab-a 'sudo reboot'
```

---

## 7. トラブルシュート

| 症状 | 原因と対処 |
| :--- | :--- |
| `permission denied ... docker.sock` | §2.4 の docker グループが未反映。SSH を張り直す |
| 蓋を閉じたら run が止まった | §2.2 が未適用、または `systemctl status sleep.target` が masked でない |
| コンテナ内 Chromium が起動しない | Playwright 公式イメージを使う。それでも失敗する場合は compose に `ipc: host` と `security_opt: [seccomp=<playwright推奨profile>]` を追加（公式ドキュメントの Docker 節参照）。`--no-sandbox` は最終手段 |
| tmpfs が一杯で書き込み失敗 | `fmg-lab run rm --older-than 7d`、または compose の tmpfs `size` を拡大（64GB 機なら 16〜32GiB が目安） |
| 操作端末から 8080 に繋がらない | ufw のサブネット指定ミス（§2.6）、または compose の `ports` 未公開 |
| 2 台で挙動が違う | イメージタグ不一致を疑う。`docker image inspect fmg-lab:latest --format '{{.Id}}'` を両ホストで比較 |
| 夜間に無人アップグレードで再起動 | `unattended-upgrades` の自動再起動設定を確認（既定では再起動しないが、有効化していれば `Unattended-Upgrade::Automatic-Reboot "false"`） |

---

## 8. チェックリスト（初回セットアップ）

- [ ] 操作端末 → 両ホストへ鍵認証 SSH（§1.2）
- [ ] 両ホスト: 基本パッケージ（§2.1）
- [ ] 両ホスト: 蓋閉じ・サスペンド禁止（§2.2）← **最重要**
- [ ] 両ホスト: Docker Engine + enable（§2.3）
- [ ] 両ホスト: docker グループ + 再ログイン（§2.4）
- [ ] 両ホスト: `/srv/fmg-lab/archive`（§2.5）
- [ ] （任意）ufw（§2.6）
- [ ] 両ホスト: NTP 同期確認（§2.7）
- [ ] 検証: hello-world / compose / Playwright イメージ（§3）
- [ ] （L1 実装後）rsync → build → up → ヘルスチェック（§5）
