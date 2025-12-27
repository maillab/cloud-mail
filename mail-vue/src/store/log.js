import { defineStore } from 'pinia'

export const useLogStore = defineStore('log', {
    state: () => ({
        // 日志列表，存储所有日志记录
        logs: [],
        // 日志级别控制，true为详细日志，false为普通日志
        detailedLog: false,
        // 日志最大数量，防止内存占用过高
        maxLogCount: 1000
    }),
    actions: {
        /**
         * 记录日志
         * @param {string} level - 日志级别：debug, info, warn, error
         * @param {string} type - 事件类型：user, system, error, performance
         * @param {string} message - 日志详细描述
         * @param {object} [extra] - 额外信息
         */
        log(level, type, message, extra = {}) {
            // 只有在详细日志模式下才记录debug级别日志
            if (level === 'debug' && !this.detailedLog) {
                return
            }
            
            const logItem = {
                timestamp: new Date().toISOString(),
                level,
                type,
                message,
                ...extra
            }
            
            // 添加到日志列表开头
            this.logs.unshift(logItem)
            
            // 限制日志数量
            if (this.logs.length > this.maxLogCount) {
                this.logs = this.logs.slice(0, this.maxLogCount)
            }
        },
        
        /**
         * 记录debug级别日志
         * @param {string} type - 事件类型
         * @param {string} message - 日志描述
         * @param {object} [extra] - 额外信息
         */
        debug(type, message, extra = {}) {
            this.log('debug', type, message, extra)
        },
        
        /**
         * 记录info级别日志
         * @param {string} type - 事件类型
         * @param {string} message - 日志描述
         * @param {object} [extra] - 额外信息
         */
        info(type, message, extra = {}) {
            this.log('info', type, message, extra)
        },
        
        /**
         * 记录warn级别日志
         * @param {string} type - 事件类型
         * @param {string} message - 日志描述
         * @param {object} [extra] - 额外信息
         */
        warn(type, message, extra = {}) {
            this.log('warn', type, message, extra)
        },
        
        /**
         * 记录error级别日志
         * @param {string} type - 事件类型
         * @param {string} message - 日志描述
         * @param {object} [extra] - 额外信息
         */
        error(type, message, extra = {}) {
            this.log('error', type, message, extra)
        },
        
        /**
         * 清除所有日志
         */
        clearLogs() {
            this.logs = []
        },
        
        /**
         * 设置日志级别
         * @param {boolean} detailed - 是否开启详细日志
         */
        setDetailedLog(detailed) {
            this.detailedLog = detailed
        },
        
        /**
         * 获取过滤后的日志
         * @param {object} filters - 过滤条件
         * @returns {Array} 过滤后的日志列表
         */
        getFilteredLogs(filters = {}) {
            let filteredLogs = [...this.logs]
            
            // 按级别过滤
            if (filters.level) {
                filteredLogs = filteredLogs.filter(log => log.level === filters.level)
            }
            
            // 按类型过滤
            if (filters.type) {
                filteredLogs = filteredLogs.filter(log => log.type === filters.type)
            }
            
            // 按关键词搜索
            if (filters.keyword) {
                const keyword = filters.keyword.toLowerCase()
                filteredLogs = filteredLogs.filter(log => 
                    log.message.toLowerCase().includes(keyword) ||
                    (log.type && log.type.toLowerCase().includes(keyword))
                )
            }
            
            // 按时间排序
            if (filters.sortBy === 'time') {
                filteredLogs.sort((a, b) => {
                    if (filters.sortOrder === 'asc') {
                        return new Date(a.timestamp) - new Date(b.timestamp)
                    } else {
                        return new Date(b.timestamp) - new Date(a.timestamp)
                    }
                })
            }
            
            return filteredLogs
        }
    }
})