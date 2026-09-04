export const oauthPlatforms = [
    {key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify'},
    {key: 'github', label: 'GitHub', icon: 'codicon:github-inverted', iconType: 'iconify'},
    {key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image'},
]

export const oauthKeys = oauthPlatforms.map(item => item.key)

//跳转第三方授权页，bind为true时授权回来绑定当前登录用户
export function toOauthAuthorize(provider, clientId, bind = false) {

    const redirectUri = encodeURIComponent(window.location.origin + '/login')

    sessionStorage.setItem('oauthProvider', provider)

    if (bind) {
        sessionStorage.setItem('oauthBind', '1')
    } else {
        sessionStorage.removeItem('oauthBind')
    }

    const authorizeUrls = {
        linuxdo: `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
        github: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email&state=${provider}`,
        google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
    }

    window.location.href = authorizeUrls[provider]
}
