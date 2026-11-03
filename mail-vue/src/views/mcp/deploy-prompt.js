// Deploy prompt for the Cloud Mail MCP service.
//
// This is the single source of the prompt text shown on the MCP landing page
// (mail-vue/src/views/mcp/index.vue). The public reference copy at
// mail-vue/public/mcp-deploy-prompt.txt is generated from this module, so the
// two can never drift apart.
//
// The prompt deliberately contains NO real key: the agent must ask the user
// for the bearer key before configuring anything.
export const MCP_DEPLOY_PROMPT = `请为我安装 Cloud Mail 的 MCP 服务，让你能用我的邮箱收发和管理邮件。

1. 添加一个名为 cloudmail 的 MCP 服务器，使用 Streamable HTTP 方式，端点是 https://mail.zgatri.com/mcp/，请求时要在 Authorization 请求头里带 Bearer 密钥。
2. 在配置之前，必须先问我要密钥；我把密钥发给你之后，你再继续配置。没有密钥不要猜、不要跳过。密钥只写进你正在配置的 MCP 客户端配置里，不要发到别处，也不要写进公开文件。
3. Claude Code 的配置方式参考：
   claude mcp add --transport http cloudmail https://mail.zgatri.com/mcp/ --header "Authorization: Bearer <把这里换成我给你的密钥>"
   其他客户端用通用 JSON 配置参考：
   {
     "mcpServers": {
       "cloudmail": {
         "url": "https://mail.zgatri.com/mcp/",
         "headers": {
           "Authorization": "Bearer <把这里换成我给你的密钥>"
         }
       }
     }
   }
4. 配置完成后，调用一次 tools/list 验证：能列出 accounts_list、mail_list、mail_search、mail_get 等只读工具即为成功，然后告诉我安装成功和可用工具列表。
注意：发邮件、删邮件、增删邮箱地址属于写操作，只有当服务端开启了写功能时才可用；如果 tools/list 里没有这些工具，说明写功能未开启，不要声称它们可用。`;
