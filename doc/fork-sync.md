# Fork 定制与上游同步

本仓库是 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 的 fork。应用定制集中在 `feat/account-desc-order`,该分支也是生产部署分支。`main` 用于同步上游源码,只保留一项 CI 定制:部署工作流仅允许 `feat/account-desc-order` 部署。`main` 因此不再是与上游完全相同的镜像。

## 分支模型

| 分支 | 用途 | 约定 |
| --- | --- | --- |
| `upstream/main` | 上游 `maillab/cloud-mail` | 只读 |
| `main` | 上游源码同步分支 | 使用普通合并同步上游,仅保留部署工作流定制,不合入应用定制 |
| `feat/account-desc-order` | 应用定制与生产部署 | 包含邮箱列表倒序、左侧账号列表筛选、收件地址邮件筛选;验证后推送会按路径规则自动部署 |

远程配置:

```
origin     git@github.com:up-jack-ma/cloud-mail.git
upstream   https://github.com/maillab/cloud-mail.git
```

如果 `upstream` 不存在,补一次即可:

```bash
git remote add upstream https://github.com/maillab/cloud-mail.git
```

## 本分支的定制内容

以下列出需要保留的定制行为。上游可能重构相关代码,同步时应检查行为,不能仅按文件名判断冲突范围。

### `.github/workflows/deploy-cloudflare.yml`

这项定制同时保留在 `main` 和 `feat/account-desc-order`:

- `push.branches` 仅包含 `feat/account-desc-order`。
- `push.paths` 包含 `mail-worker/**`、`mail-vue/**` 和工作流文件自身;只改文档不会自动部署。
- 部署 job 使用 `if: github.ref == 'refs/heads/feat/account-desc-order'`。手动运行时若选择 `main` 或其他分支,部署 job 会跳过。

GitHub 的 `push` 事件使用被推分支里的工作流。只修改定制分支无法阻止 `main` 中的旧工作流部署,因此不能把 `main` 的这项 CI 定制还原成上游配置。

### `mail-worker/src/service/account-service.js`

- `list()`:排序由 `sort DESC, accountId ASC` 改为 `sort DESC, accountId DESC`;首页游标默认值由 `0` 改为 `9999999999`;keyset 分页条件由 `gt(accountId, cursor)` 改为 `lt(accountId, cursor)`。

  三处必须一起改。只翻转 `orderBy` 而不动游标,翻到第二页会查不到数据。

- `list()` 的 `keyword`:去掉首尾空格后,按邮箱地址 `email` 或名称 `name` 做不区分英文字母大小写的子串匹配。通过参数化 `LIKE` 和 `ESCAPE '!'` 转义输入中的 `!`、`%`、`_`,因此 `%`、`_` 按字面字符搜索,不会扩展成通配符。
- 关键词条件与当前用户 `userId`、正常账号 `isDel` 条件一起执行,只返回自己的未删除账号。筛选在服务端完成后继续使用原来的倒序游标分页,可以找到尚未加载到前端的账号。空关键词恢复完整账号列表;首页缺少 `lastSort`、为 `null` 或空字符串时,统一使用首页游标,避免遗漏置顶账号。

- `setAsTop()`:改为把目标账号的 `sort` 置为该用户的 `max(sort) + 1`,不再修改主账号的 `sort`。

  上游实现是「把主账号 sort 顶高,目标账号排它下面」,隐含「主账号永远第一」。倒序之后主账号(创建最早、id 最小)本应沉到底部,保留上游逻辑会导致一执行置顶就把主账号拉回顶部。

### `mail-vue/src/layout/account/index.vue`

- 左侧账号列表提供邮箱地址或名称输入框。这是筛选账号列表,与页面顶部按「收件地址」筛选邮件是两个独立功能。`mail-vue/src/request/account.js` 为 `accountList()` 增加 `keyword` 参数,每一页都携带相同关键词。
- 输入使用 250ms 防抖;变更关键词会重置列表及分页,立即使旧请求失效。请求版本检查同时保护返回数据和加载状态,避免旧关键词的慢响应覆盖新结果;清空关键词直接重新查询,组件卸载时也会清理定时器并使旧请求失效。
- `getAccountList()`:仅首次未筛选加载时用 `changeAccount(list[0])` 自动选中列表第一项,同时更新 `currentAccount` 和 `currentAccountId`。之后筛选、清空筛选及刷新列表均保留当前账号,即使它不在当前筛选结果中,右侧邮件也不会自动跳到另一账号。
- `submit()`:新增成功后立即选中新账号,清空账号筛选并重新加载列表。新账号与置顶账号的位置以服务端排序为准,不再本地插入;此次重载也不会把选中项切回首行。
- `changeUserAccountName` 监听:按 `accountId` 查找主账号并判空,不再假设主账号位于下标 0。账号改名或收到主账号改名通知后,若当前有关键词,重新加载筛选结果,使已不匹配的账号及时移出列表。
- `setAsTop()`:后端成功后重新加载当前筛选列表,使用后台返回的真实 `sort`,不再在局部筛选结果中推算最大值或本地 `unshift`。
- `remove()`:删除成功后重新加载当前筛选列表。若删除的是当前选中账号,先切回主邮箱,避免右侧继续使用已删除账号。

### `mail-vue/src/init/init.js`

启动时用 `accountList(0, 1)` 取最新账号作为默认选中项(受 `hasPerm('account:query')` 保护,失败则回退到主账号)。

不加这段也能工作 —— 账号列表加载完会触发 `currentAccountId` 变化 —— 但会先加载主账号邮件再跳到最新账号,每次进页面都有一次可见的闪烁和一次多余请求。

### 收件地址邮件筛选

此功能筛选右侧邮件列表,不改变左侧账号列表的关键词或选中账号。

- `mail-vue/src/layout/header/index.vue`:收件箱搜索提供「收件地址」选项,搜索类型为 `recipientAddress`。
- `mail-vue/src/views/email/index.vue`:仅当搜索类型为 `recipientAddress` 且搜索内容非空时,为这次查询启用 `allReceive`,跨当前用户自己的全部邮箱筛选邮件。清空筛选或切换搜索类型后,恢复原来的收件箱范围;不会修改账号保存的 `allReceive` 设置。
- `mail-vue/src/components/email-search/index.vue` 及中英文文案:说明收件地址搜索覆盖自己的全部邮箱,并让移动端搜索选项支持横向滚动。
- 后端复用 `mail-worker/src/service/email-service.js` 现有查询:始终按当前用户过滤,再对收件地址执行 `LIKE` 匹配。这里扩大的是当前用户的邮箱范围,不会查询其他用户邮件,也不需要新增数据库迁移。

## 同步上游

### 1. 把上游合入 main

先确认工作区干净,再同步远端和本地 `main`:

```bash
git fetch origin
git fetch upstream
git checkout main
git merge --ff-only origin/main
git merge upstream/main
```

对 `origin/main` 使用 `--ff-only` 是为了发现本地与远端意外分叉;若失败,先检查双方提交,不要强制覆盖。对 `upstream/main` 必须使用普通 `merge`,因为本地 `main` 保留了 CI 定制提交。

如有冲突,保留上游应用代码和上述 CI 分支限制。推送前检查工作流仍然只允许 `feat/account-desc-order` 部署,然后:

```bash
git push origin main
```

推送 `main` 不会自动部署。不要把整条 `feat/account-desc-order` 合回 `main`,否则应用定制也会进入上游同步分支。

### 2. 把上游变更合进定制分支

```bash
git checkout feat/account-desc-order
git merge --ff-only origin/feat/account-desc-order
git merge main
```

解决冲突并完成下面的验证后再推送。`feat/account-desc-order` 是部署分支,推送应用或工作流改动会直接触发生产部署。

### 3. 冲突处理要点

- **`account-service.js` 的 `list()`**:确认合并后 `orderBy` 是 `desc(sort), desc(accountId)`、游标默认值是 `9999999999`、条件是 `lt(accountId, ...)`。保留 `keyword` 在服务端按邮箱或名称筛选、用户和删除状态限制、字面通配符转义,以及空首页游标的处理;筛选后的分页也必须不重不漏。
- **`account-service.js` 的 `setAsTop()`**:如果上游重写了这个方法,以「目标账号 = `max(sort) + 1`,不动主账号」为准。
- **`account/index.vue` 与 `request/account.js`**:保留每页传递 `keyword`、输入防抖与旧响应保护。仅首次未筛选加载自动选择首项;筛选、清空和刷新保留当前账号。新增成功清筛选、重载并选中新账号;置顶使用服务端排序重载;筛选期间改名后重载;删除当前账号切回主邮箱。不要恢复旧的本地插入或本地推算 `sort` 逻辑。
- **`init.js`**:上游若重构了 `init()`,把那段 `hasPerm('account:query')` 判断挪到 `userStore.user` 赋值之后就行(`hasPerm` 依赖它)。
- **收件地址邮件筛选**:保留 `recipientAddress` 选项、仅非空收件地址搜索扩大到自己的全部邮箱、搜索范围提示及移动端横向滚动。后端必须保留当前用户过滤和收件地址匹配条件;不要与左侧账号列表的 `keyword` 混用。
- **部署工作流**:两个分支都必须保留 `push.branches` 限制和 job 的分支判断,不要用上游的 `branches: [ main ]` 覆盖。保留工作流自身的路径过滤项,确保部署配置变更也能在定制分支触发验证。

### 4. 验证

`mail-worker` 端的分页可以不起服务直接用 sqlite 验证:

```bash
sqlite3 :memory: <<'SQL'
CREATE TABLE account(account_id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, user_id INT, sort INT DEFAULT 0, is_del INT DEFAULT 0);
INSERT INTO account(email,user_id,sort) VALUES
 ('admin@x',1,0),('a1@x',1,0),('a2@x',1,0),('a3@x',1,0),('a4@x',1,0),
 ('a5@x',1,0),('a6@x',1,0),('pinned@x',1,3);
SELECT account_id,email,sort FROM account WHERE user_id=1 AND is_del=0
 AND (sort < 9999999999 OR (sort = 9999999999 AND account_id < 9999999999))
 ORDER BY sort DESC, account_id DESC LIMIT 3;
SQL
```

期望第一页是 `pinned(8) → a6(7) → a5(6)`;把游标换成上一页最后一条的 `(sort, account_id)` 继续翻,应当不重不漏,主账号 `admin(1)` 排在最后。

前端跑一遍:

```bash
cd mail-vue && pnpm install --frozen-lockfile && pnpm build
```

再检查以下行为:

- 账号列表保持倒序、置顶账号优先;首次进入和新增账号后的默认选中正常。
- 左侧按完整邮箱、地址片段或名称筛选,英文字母大小写不影响结果;首尾空格被忽略,`%`、`_` 按字面匹配。包含多页的筛选结果应不重不漏,且不返回其他用户或已删除账号。
- 快速连续输入、清空关键词或在请求中刷新时,旧响应不能混入新结果;筛选、清空与刷新不会切换右侧当前邮箱。
- 筛选期间新增账号后清空筛选并选中新账号;置顶后顺序和后台 `sort` 一致;改名后更新匹配结果;删除当前账号后回到主邮箱。
- 在一个邮箱的收件箱中,按另一个自有邮箱的完整地址或地址片段搜索,能查到匹配邮件;清空收件地址搜索后恢复原来的收件箱范围。
- 主题、发件地址等其他搜索方式保持原有范围,分页仍然保留筛选条件。
- 桌面端能看到搜索范围提示,移动端可横向滚动选择「收件地址」。
- `main` 和定制分支的工作流都只允许 `feat/account-desc-order` 部署。

验证通过并提交本次改动后,在仓库目录推送定制分支:

```bash
git push origin feat/account-desc-order
```

## 部署

CI(`.github/workflows/deploy-cloudflare.yml`)仅在 `feat/account-desc-order` 的推送涉及 `mail-worker/**`、`mail-vue/**` 或该工作流文件时自动部署。推送 `main` 不部署,只修改文档也不会自动部署。

需要重新部署同一份代码时,可以手动运行:

> GitHub → Actions → `🚀 Deploy cloud-mail to Cloudflare Workers` → Run workflow → 分支选 `feat/account-desc-order`

手动选择 `main` 或其他分支时,工作流会创建运行记录,但部署 job 会因分支判断而跳过。

推送或手动触发后,在 Actions 确认运行分支为 `feat/account-desc-order`、提交号与预期一致,并等待部署和数据库初始化步骤均成功。随后刷新线上页面,检查账号倒序、左侧账号列表筛选和顶部收件地址邮件筛选。Git 推送成功只代表代码已同步,不代表部署已经完成。

## 数据注意事项

重新部署不会重置已有账号的 `sort`。如果在改动之前用过「置顶」,主账号的 `sort` 已被写成非 0,倒序后它仍会排在最上面。下面的 SQL 会清除所有账号的置顶排序,只有确实需要全量清除时才手动执行,不要把它加入同步或部署流程:

```sql
UPDATE account SET sort = 0;
```

## 备注

`origin/dev-desc` 是更早一次定制的分支,与当前 `main` 属于两段无关历史(`git merge-base` 无输出),已无法合并,可以删除。
