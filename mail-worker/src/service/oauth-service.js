import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { eq } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";

const oauthService = {

	async bindUser(c, params) {

		const { email, oauthUserId, code } = params;

		const oauthRow = await this.getById(c, oauthUserId);

		let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (userRow) {
			throw new BizError('用户已绑定有邮箱')
		}

		// 检查邮箱是否已存在
		let existingUser = await userService.selectByEmailIncludeDel(c, email);
		
		if (existingUser) {
			// 邮箱已存在，直接绑定
			if (existingUser.isDel === 1) {
				throw new BizError('该邮箱已被删除')
			}
			userRow = existingUser;
		} else {
			// 邮箱不存在，注册新用户
			await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(), code }, true);
			userRow = await userService.selectByEmail(c, email);
		}

		await orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthUserId, oauthUserId)).run();
		const jwtToken = await loginService.login(c, { email, password: null }, true);

		return { userInfo: oauthRow, token: jwtToken}
	},

	async linuxDoLogin(c, params) {

		const { code } = params;

		let token = '';
		let userInfo = {}

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', c.env.linuxdo_client_id)
		reqParams.append('client_secret', c.env.linuxdo_client_secret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', c.env.linuxdo_callback_url)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		token = await tokenRes.json()

		const userRes = await fetch('https://connect.linux.do/api/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.active = userInfo.active ? 0 : 1;
		userInfo.silenced = userInfo.active ? 0 : 1;
		userInfo.trustLevel = userInfo.trust_level;
		userInfo.avatar = userInfo.avatar_url;

		const  oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			// 自动生成默认邮箱地址
			const defaultEmail = `${userInfo.username}@cnmailcn.dpdns.org`;
			// 检查邮箱是否已存在
			let isEmailAvailable = false;
			let emailSuggestions = [];
			
			try {
				const existingUser = await userService.selectByEmailIncludeDel(c, defaultEmail);
				isEmailAvailable = !existingUser;
			} catch (error) {
				isEmailAvailable = false;
			}
			
			if (!isEmailAvailable) {
				// 生成3-5个备选邮箱建议
				emailSuggestions = await this.generateEmailSuggestions(c, userInfo.username);
			}
			
			// 返回OAuth信息和邮箱建议
			return {
				userInfo: oauthRow,
				token: null,
				defaultEmail,
				isEmailAvailable,
				emailSuggestions
			};
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken }
	},

	async githubLogin(c, params) {

		const { code } = params;

		let token = '';
		let userInfo = {}

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', c.env.github_client_id)
		reqParams.append('client_secret', c.env.github_client_secret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', c.env.github_callback_url)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: { 
				"Content-Type": "application/x-www-form-urlencoded",
				"Accept": "application/json"
			},
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		token = await tokenRes.json()

		const userRes = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.username = userInfo.login;
		userInfo.name = userInfo.name || userInfo.login;
		userInfo.avatar = userInfo.avatar_url;
		userInfo.active = 0;
		userInfo.silenced = 0;
		userInfo.trustLevel = 0;

		// 保存OAuth信息
		const oauthRow = await this.saveUser(c, userInfo);
		
		// 查找关联用户
		let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);
		
		// 如果没有找到用户，尝试查找是否有其他用户绑定了该GitHub账户
		if (!userRow || oauthRow.userId === 0) {
			// 检查是否有用户已经绑定了该GitHub账户
			const existingBinding = await userService.selectByOauthUserId(c, userInfo.oauthUserId);
			if (existingBinding) {
				userRow = existingBinding;
				// 更新OAuth记录的userId
				await orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthId, oauthRow.oauthId)).run();
			}
		}

		if (!userRow) {
			// 自动生成默认邮箱地址
			const defaultEmail = `${userInfo.username}@cnmailcn.dpdns.org`;
			// 检查邮箱是否已存在
			let isEmailAvailable = false;
			let emailSuggestions = [];
			
			try {
				const existingUser = await userService.selectByEmailIncludeDel(c, defaultEmail);
				isEmailAvailable = !existingUser;
			} catch (error) {
				isEmailAvailable = false;
			}
			
			if (!isEmailAvailable) {
				// 生成3-5个备选邮箱建议
				emailSuggestions = await this.generateEmailSuggestions(c, userInfo.username);
			}
			
			// 返回OAuth信息和邮箱建议
			return {
				userInfo: oauthRow,
				token: null,
				defaultEmail,
				isEmailAvailable,
				emailSuggestions
			};
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken }
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).returning().get();
		}

	},
	
	// 生成邮箱建议
	async generateEmailSuggestions(c, username) {
		const suggestions = [];
		const domains = ['cnmailcn.dpdns.org'];
		const suffixes = ['a', 'b', 'c', '2025', '123'];
		
		// 尝试生成5个建议
		for (let i = 0; i < suffixes.length; i++) {
			const suffix = suffixes[i];
			const email = `${username}${suffix}@${domains[0]}`;
			
			try {
				const existingUser = await userService.selectByEmailIncludeDel(c, email);
				if (!existingUser) {
					suggestions.push(email);
				}
			} catch (error) {
				// 邮箱不存在，可用
				suggestions.push(email);
			}
			
			// 生成3个建议后停止
			if (suggestions.length >= 3) {
				break;
			}
		}
		
		// 如果生成的建议不足3个，再尝试其他组合
		if (suggestions.length < 3) {
			for (let i = 0; i < 10; i++) {
				const randomSuffix = Math.floor(Math.random() * 1000);
				const email = `${username}${randomSuffix}@${domains[0]}`;
				
				try {
					const existingUser = await userService.selectByEmailIncludeDel(c, email);
					if (!existingUser) {
						suggestions.push(email);
					}
				} catch (error) {
					// 邮箱不存在，可用
					suggestions.push(email);
				}
				
				if (suggestions.length >= 3) {
					break;
				}
			}
		}
		
		return suggestions;
	},

	async getById(c, oauthUserId) {
		return await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
	},

	async deleteByUserId(c, userId) {
		await orm(c).delete(oauth).where(eq(oauth.userId, userId)).run();
	},

	//定时任务凌晨清除未绑定邮箱的oauth用户
	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},

	async unbindGithub(c, userId) {
		await orm(c).delete(oauth).where(eq(oauth.userId, userId)).run();
	},

}

export default  oauthService
