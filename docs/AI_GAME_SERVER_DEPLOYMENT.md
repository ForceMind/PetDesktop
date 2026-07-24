# Coco AI 游戏服务器部署

本文用于把 `codex/ai-game-pet-demo` 分支部署到 Linux 服务器。部署脚本可重复运行，
适用于第一次安装以及之后每次 `git pull` 更新。

## 支持范围

`deploy-linux.sh` 会自动识别：

- Debian、Ubuntu（`apt`）
- Fedora、Rocky Linux、AlmaLinux（`dnf`）
- CentOS、Amazon Linux（`yum` 或 `dnf`）
- openSUSE、SLES（`zypper`）
- Arch Linux、Manjaro（`pacman`）
- Alpine Linux（`apk`）

服务管理支持 systemd 和 OpenRC。Node.js 要求 20 或更高版本；脚本会优先使用服务器已有
版本。系统 Node.js 过旧或没有 npm 时，脚本把经过 SHA-256 校验的 Node.js 22 下载到
`ai-game-server/.runtime`，只供 Coco 使用，不卸载、不升级服务器全局 Node.js/npm。
Alpine 默认没有 Bash 时，脚本会先通过 `apk` 安装 Bash，再自动继续同一次部署。

## 第一次部署

建议把仓库克隆到普通部署用户有读写权限的目录，不要把仓库放在临时目录。

服务器还没有 `PetDesktop` 目录时：

```bash
git clone --branch codex/ai-game-pet-demo --single-branch https://github.com/ForceMind/PetDesktop.git
cd PetDesktop
sudo ./deploy-linux.sh
```

服务器已经克隆过仓库、但还没有本地 Demo 分支时：

```bash
cd PetDesktop
git fetch origin
git switch --track -c codex/ai-game-pet-demo origin/codex/ai-game-pet-demo
git pull --ff-only origin codex/ai-game-pet-demo
sudo ./deploy-linux.sh
```

如果提示分支已经存在，改用：

```bash
git switch codex/ai-game-pet-demo
git pull --ff-only origin codex/ai-game-pet-demo
sudo ./deploy-linux.sh
```

不要使用只有仓库地址、没有分支名的 `git pull` 来部署 Demo；服务器必须明确位于
`codex/ai-game-pet-demo` 分支。

脚本会：

1. 安装 Git、curl、证书、Node.js 等系统依赖；
2. 保留已有 `ai-game-server/.env`，不存在时从 `.env.example` 创建；
3. 在 `.env` 没有管理 Token 时生成随机 `ADMIN_TOKEN`，但不会打印；
4. 默认让 Coco 监听 `0.0.0.0`，从 8787 开始选择没有被占用的 TCP 端口；
5. 使用 `npm ci` 安装锁定依赖；
6. 运行测试并构建 `dist/server.mjs`；
7. 移除开发依赖；
8. 安装并启动独立的 `coco-ai-game` 系统服务；
9. 只为选中的端口添加 UFW/firewalld 规则，并从本机地址执行健康检查。

首次生成的 `.env` 使用 Mock 游戏和 Mock AI，便于先确认网页和服务正常。随后通过服务器上的
设置页或直接编辑 `.env` 配置真实参数。`.env` 权限会被设为 `600`，且已被 Git 忽略。

部署结束会打印：

```text
[Coco] Open http://SERVER_IP:8787/ (replace SERVER_IP with this server's public IP).
```

如果 8787 已被其他程序占用，脚本不会停止它，而会打印实际选中的下一个空闲端口，例如 8788。
浏览器使用 `http://服务器公网IP:实际端口/` 访问。云厂商安全组无法由服务器脚本修改，需要允许
输出的 TCP 端口；本机启用 UFW 或 firewalld 时，脚本会只开放该端口。

## 不影响服务器上其他服务

默认运行 `sudo ./deploy-linux.sh` 时：

- 不安装、不修改、不重启 Nginx；
- 不占用 80 或 443；
- 不停止占用 8787 的其他进程，而是自动寻找下一个空闲端口；
- 只安装实际缺少的 curl、Git、tar、xz、OpenSSL/CA 证书，不升级已经存在的基础工具；
- 不替换服务器已有的 Node.js/npm；需要时使用仓库内被 Git 忽略的私有 Node.js 22；
- 只创建或更新 `coco-ai-game` 服务和仓库内的 `ai-game-server` 文件；
- 只添加实际选中端口的防火墙放行规则，不改动其他端口规则。

希望优先从其他端口开始探测时：

```bash
sudo ./deploy-linux.sh --port 9000
```

如果 9000 已占用，同样会自动选择 9001、9002……。

## 配置真实参数

在服务器编辑：

```bash
sudo -u "$(stat -c '%U' .)" nano ai-game-server/.env
```

至少检查：

```dotenv
HOST=0.0.0.0
PORT=8787
DEMO_MODE=true

AI_API_KEY=
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=your-openai-compatible-model

GAME_PROVIDER=coconut
GAME_TEST_ACCOUNT_ID=
GAME_LOBBY_IG=
GAME_SLOT_IG=
GAME_BINGO_IG=
GAME_CHARMED_IG=
GAME_FRUIT_IG=
GAME_JETSET_IG=

ADMIN_TOKEN=
```

不要把 Key、IG、测试账号或 Token 放入 Git、命令行参数、Nginx 配置或分享链接。配置完成后
重新运行部署脚本，或者只重启服务：

```bash
sudo systemctl restart coco-ai-game
```

Alpine/OpenRC：

```bash
sudo rc-service coco-ai-game restart
```

## 可选使用 Nginx

默认通过服务器 IP 测试不需要 Nginx。只有确认这台服务器的 80 端口和现有站点规划允许时，
才使用以下选项。已有域名时：

```bash
sudo ./deploy-linux.sh --domain coco.example.com
```

明确希望由 Nginx 的 80 端口代理时：

```bash
sudo ./deploy-linux.sh --nginx
```

该选项会安装 Nginx、创建反向代理并重启 Nginx，因此不应在未检查现有站点的共享服务器上使用。
反向代理会保留 NDJSON 游戏进度流和 WebSocket 请求所需的请求头。
服务器防火墙和云安全组需要允许 `80/tcp`。Node 服务仍只监听 `127.0.0.1:8787`，不直接暴露。
脚本不会删除已有的 Nginx 默认站点或其他虚拟主机；如果同一地址仍显示旧页面，请根据服务器现有
站点规划手动停用冲突配置，再运行 `sudo nginx -t && sudo systemctl reload nginx`。

## HTTPS

域名 DNS 已指向服务器、Nginx 的 HTTP 页面可以访问后，可使用 Certbot：

Debian/Ubuntu：

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d coco.example.com
```

Fedora/Rocky/Alma/Amazon Linux：

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d coco.example.com
```

其他发行版请使用该发行版提供的 Certbot 包。HTTPS 完成后，体验者可以直接打开域名；
地址栏可以不带参数，也可以仅使用 `?userId=...` 覆盖服务器默认测试账号。

## 日常更新

服务器只需要：

```bash
cd /path/to/PetDesktop
git switch codex/ai-game-pet-demo
git pull --ff-only origin codex/ai-game-pet-demo
sudo ./deploy-linux.sh
```

跳过测试以加快已经验证过的紧急更新：

```bash
sudo ./deploy-linux.sh --skip-tests
```

部署脚本不会删除或覆盖 `.env`。

## 查看状态和日志

systemd：

```bash
sudo systemctl status coco-ai-game --no-pager
sudo journalctl -u coco-ai-game -n 200 --no-pager
sudo journalctl -u coco-ai-game -f
```

OpenRC：

```bash
sudo rc-service coco-ai-game status
sudo tail -f /var/log/coco-ai-game/output.log /var/log/coco-ai-game/error.log
```

本机健康检查：

```bash
APP_PORT="$(awk -F= '$1 == "PORT" { print $2; exit }' ai-game-server/.env)"
curl -I "http://127.0.0.1:${APP_PORT}/"
```

## OpenCloudOS / RHEL 的 Node.js 18 与 npm 冲突

如果旧版脚本曾出现以下 DNF 提示：

```text
package npm ... requires nodejs = 18...
cannot install both nodejs 22 ... and nodejs 18...
```

说明服务器全局 Node.js 18/npm 被其他 RPM 依赖约束，旧脚本尝试安装全局 Node.js 22 时被
DNF 安全拦截。不要运行 `dnf remove nodejs npm`，也不需要使用 `--allowerasing`。拉取最新
分支后重新部署即可：

```bash
cd PetDesktop
git switch codex/ai-game-pet-demo
git pull --ff-only origin codex/ai-game-pet-demo
sudo ./deploy-linux.sh
```

新版脚本会显示 `Downloading a private Node.js 22 runtime for Coco`，并把运行时放到
`ai-game-server/.runtime`。系统的 `node --version` 和已有 Node 服务不会改变。

## 回滚

先查看提交：

```bash
git log --oneline -10
```

切换到需要恢复的提交后重新部署：

```bash
git switch --detach COMMIT_SHA
sudo ./deploy-linux.sh
```

恢复到分支最新版本：

```bash
git switch codex/ai-game-pet-demo
git pull --ff-only
sudo ./deploy-linux.sh
```

`.env` 不属于 Git，因此代码回滚不会覆盖服务器配置。

## 安全检查

- `.env` 必须保持 `600` 权限。
- 公网部署必须配置长随机 `ADMIN_TOKEN`。
- 不要在聊天、URL、日志或截图中展示 AI Key、IG、测试账号 Token。
- 默认 IP 直连模式只开放脚本选中的 Coco 端口；云安全组也只需允许这个端口。
- 可选 Nginx 模式会把 Node 改为只监听 `127.0.0.1`，由 Nginx 对外提供访问。
- Settings API 不会返回已保存的密钥原值；浏览器中的管理 Token 只保存在当前标签页。
- 游戏执行仍必须经过确认卡、下注档位、总额、频率、白名单、余额和结果数字校验。
