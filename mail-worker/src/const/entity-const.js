import verifyRecordService from '../service/verify-record-service';

export const userConst = {
	status: {
		NORMAL: 0,
		BAN: 1
	}
}

export const accountConst = {
	allReceive: {
		CLOSE: 0,
		OPEN: 1
	}
}

export const roleConst = {
	isDefault: {
		CLOSE: 0,
		OPEN: 1
	},
	banEmailType: {
		ALL: 0,
		CONTENT: 1
	},
	sendType: {
		COUNT: 'count',
		DAY: 'day'
	}
}

export const permConst = {
	type: {
		BUTTON: 2,
	}
}

export const emailConst = {
	type: {
		SEND: 1,
		RECEIVE: 0
	},
	status:  {
		RECEIVE: 0,
		SENT: 1,
		DELIVERED: 2,
		BOUNCED: 3,
		COMPLAINED: 4,
		DELAYED: 5,
		SAVING: 6,
		NOONE: 7,
		FAILED: 8
	},
	unread: {
		UNREAD: 0,
		READ: 1
	}
}

export const attConst = {
	status: {
		NORMAL: 0,
		UNUSED: 1
	},
	type: {
		ATT: 0,
		EMBED: 1
	}
}

export const settingConst = {
	register: {
		OPEN: 0,
		CLOSE: 1,
	},
	regKey: {
		OPEN: 0,
		CLOSE: 1,
		OPTIONAL: 2,
	},
	receive: {
		OPEN: 0,
		CLOSE: 1,
	},
	send: {
		OPEN: 0,
		CLOSE: 1
	},
	addEmail: {
		OPEN: 0,
		CLOSE: 1
	},
	manyEmail: {
		OPEN: 0,
		CLOSE: 1,
	},
	registerVerify: {
		OPEN: 0,
		CLOSE: 1,
		COUNT: 2,
	},
	addEmailVerify: {
		OPEN: 0,
		CLOSE: 1,
		COUNT: 2,
	},
	forwardStatus: {
		OPEN: 0,
		CLOSE: 1,
	},
	tgBotStatus: {
		OPEN: 0,
		CLOSE: 1,
	},
	ruleType: {
		ALL: 0,
		RULE: 1
	},
	noRecipient: {
		OPEN: 0,
		CLOSE: 1,
	},
	kvStorage: {
		OPEN: 0,
		CLOSE: 1
	},
	forcePathStyle: {
		OPEN: 0,
		CLOSE: 1
	},
	aiCode: {
		OPEN: 0,
		CLOSE: 1
	},
	authRefresh: {
		OPEN: 1,
		CLOSE: 0
	}
}

export const verifyRecordType = {
	REG: 0,
	ADD: 1,
}


export const isDel = {
	DELETE: 1,
	NORMAL: 0
}
