<template>
  <div class="box">
    <div class="header-actions">
      <Icon class="icon" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20" @click="handleBack"/>
      <Icon v-perm="'email:delete'" class="icon" icon="uiw:delete" width="16" height="16" @click="handleDelete"/>
      <span class="star" v-if="emailStore.contentData.showStar">
        <Icon class="icon" @click="changeStar" v-if="email.isStar" icon="fluent-color:star-16" width="20" height="20"/>
        <Icon class="icon" @click="changeStar" v-else icon="solar:star-line-duotone" width="18" height="18"/>
      </span>
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openReply" icon="la:reply" width="21" height="21" />
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openForward" icon="iconoir:arrow-up-right" width="20" height="20" />
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title">
          {{ email.subject }}
        </div>
        <div class="content">
          <div class="email-info">
            <div>
              <div class="send"><span class="send-source">{{$t('from')}}</span>
                <div class="send-name">
                  <span class="send-name-title">{{ email.name }}</span>
                  <span><{{ email.sendEmail }}></span>
                </div>
              </div>
              <div class="receive"><span class="source">{{$t('recipient')}}</span><span class="receive-email">{{  formateReceive(email.recipient) }}</span></div>
              <div class="receive" v-if="formateReceive(email.cc)"><span class="source">{{$t('cc')}}</span><span class="receive-email">{{  formateReceive(email.cc) }}</span></div>
              <div class="date">
                <div>{{ formatDetailDate(email.createTime) }}</div>
              </div>
            </div>
            <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
          </div>
          <el-scrollbar class="htm-scrollbar" :class="attList.length === 0 ? 'bottom-distance' : ''">
            <ShadowHtml class="shadow-html" :html="emailBody.value" v-if="emailBody.type === 'html'" />
            <pre v-else class="email-text" >{{emailBody.value}}</pre>
          </el-scrollbar>
          <div class="calendar-list" v-if="calendarInvites.length > 0">
            <div class="calendar-card" v-for="invite in calendarInvites" :key="invite.attId">
              <div class="calendar-head">
                <Icon icon="fluent:calendar-ltr-24-regular" width="22" height="22"/>
                <div class="calendar-title">{{ invite.summary || email.subject || $t('calendarInvite') }}</div>
              </div>
              <div class="calendar-row" v-if="formatCalendarRange(invite)">
                <Icon icon="solar:calendar-date-bold-duotone" width="18" height="18"/>
                <span>{{ formatCalendarRange(invite) }}</span>
              </div>
              <div class="calendar-row" v-if="invite.location">
                <Icon icon="solar:map-point-bold-duotone" width="18" height="18"/>
                <span>{{ invite.location }}</span>
              </div>
              <div class="calendar-row" v-if="invite.meetingId">
                <span class="calendar-label">{{ $t('meetingId') }}</span>
                <span>{{ invite.meetingId }}</span>
              </div>
              <div class="calendar-row" v-if="invite.accessCode">
                <span class="calendar-label">{{ $t('meetingCode') }}</span>
                <span>{{ invite.accessCode }}</span>
              </div>
              <a v-if="invite.teamsUrl" class="join-link" :href="invite.teamsUrl" target="_blank" rel="noopener noreferrer">
                <Icon icon="fluent:people-team-24-filled" width="18" height="18"/>
                <span>{{ $t('joinMeeting') }}</span>
              </a>
            </div>
          </div>
          <div class="att" v-if="attList.length > 0">
            <div class="att-title">
              <span>{{$t('attachments')}}</span>
              <span>{{$t('attCount',{total: attList.length})}}</span>
            </div>
            <div class="att-box">

              <div class="att-item" v-for="att in attList" :key="att.attId">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(displayAttName(att))" />
                </div>
                <div class="att-name" @click="showImage(att.key)">
                  {{ displayAttName(att) }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(displayAttName(att))" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                  <a :href="attachmentDownloadUrl(att)" :download="displayAttName(att)">
                    <Icon icon="system-uicons:push-down" width="22" height="22"/>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {computed, reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailCalendar, emailDelete, emailRead} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {cvtR2Url,toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import {attachmentDisplayName, attachmentDownloadUrl, formatEmailBody, isCalendarAttachment} from "@/utils/email-content.js";

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = emailStore.contentData.email
const showPreview = ref(false)
const srcList = reactive([])
const calendarInvites = reactive([])
const attList = computed(() => email.attList || [])
const emailBody = computed(() => {
  const body = formatEmailBody(email);
  if (body.type === 'html') {
    return {
      type: 'html',
      value: formatImage(body.value)
    }
  }
  return body
})

const { t } = useI18n()
watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

onMounted(() => {
  if (emailStore.contentData.showUnread && email.unread === EmailUnreadEnum.UNREAD) {
    email.unread = EmailUnreadEnum.READ;
    emailRead([email.emailId]);
  }
  loadCalendarInvites();
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
})

function openReply() {
  uiStore.writerRef.openReply(email)
}

function openForward() {
  uiStore.writerRef.openForward(email)
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function displayAttName(att) {
  const name = attachmentDisplayName(att);
  return name === 'attachment' ? t('attachment') : name;
}

async function loadCalendarInvites() {
  const calendarAtts = attList.value.filter(isCalendarAttachment);
  if (calendarAtts.length === 0) {
    return;
  }

  const invites = await Promise.all(calendarAtts.map(async att => {
    try {
      const invite = await emailCalendar(att.attId);
      return hasCalendarData(invite) ? invite : null;
    } catch (e) {
      console.error(e);
      return null;
    }
  }));

  calendarInvites.splice(0, calendarInvites.length, ...invites.filter(Boolean));
}

function hasCalendarData(invite) {
  return !!(invite?.summary || invite?.start || invite?.end || invite?.teamsUrl || invite?.meetingId || invite?.accessCode);
}

function formatCalendarRange(invite) {
  const start = formatCalendarPoint(invite.start);
  const end = formatCalendarPoint(invite.end);
  return [start, end].filter(Boolean).join(' - ');
}

function formatCalendarPoint(point) {
  if (!point) {
    return '';
  }

  if (point.iso) {
    return formatDetailDate(point.iso);
  }

  if (point.local) {
    const text = point.local.replace('T', ' ').slice(0, 16);
    return point.timeZone ? `${text} (${point.timeZone})` : text;
  }

  return point.raw || '';
}

function formateReceive(recipient) {
  try {
    recipient = JSON.parse(recipient || '[]')
  } catch (e) {
    return ''
  }
  return recipient.map(item => item.address).filter(Boolean).join(', ')
}

function changeStar() {
  if (email.isStar) {
    email.isStar = 0;
    starCancel(email.emailId).then(() => {
      email.isStar = 0;
      emailStore.cancelStarEmailId = email.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.emailId])
    }).catch((e) => {
      console.error(e)
      email.isStar = 1;
    })
  } else {
    email.isStar = 1;
    starAdd(email.emailId).then(() => {
      email.isStar = 1;
      emailStore.addStarEmailId = email.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email)
    }).catch((e) => {
      console.error(e)
      email.isStar = 0;
    })
  }
}

const handleBack = () => {
  router.back()
}

const handleDelete = () => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
      })
    } else  {

      allEmailDelete(email.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.emailId]
      })
    }

    router.back()
  })
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: var(--header-actions-border);
  font-size: 18px;
  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
  }
}


.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
  @media (max-width: 1023px) {
    padding-left: 15px;
    padding-right: 15px;
  }

  .email-title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 10px;
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;

    .calendar-list {
      margin-top: 10px;
      margin-bottom: 8px;
      display: grid;
      gap: 10px;
      width: min(620px, calc(100vw - 60px));
    }

    .calendar-card {
      border: 1px solid var(--light-border-color);
      border-radius: 6px;
      padding: 12px 14px;
      display: grid;
      gap: 9px;
      background: var(--light-ill);
      color: var(--regular-text-color);
    }

    .calendar-head {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--primary-text-color);
      font-weight: 600;
    }

    .calendar-title {
      word-break: break-word;
    }

    .calendar-row {
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1.4;
      word-break: break-word;
    }

    .calendar-label {
      min-width: 68px;
      color: var(--secondary-text-color);
    }

    .join-link {
      color: var(--el-color-primary);
      display: flex;
      align-items: center;
      gap: 6px;
      width: fit-content;
      text-decoration: none;
      font-weight: 600;
    }

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 6px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }
        }
      }
    }

    .email-info {

      border-bottom: 1px solid var(--light-border-color);
      margin-bottom: 20px;
      padding-bottom: 8px;
      @media (max-width: 1024px) {
        margin-bottom: 15px;
      }
      .date {
        color: var(--regular-text-color);
        margin-bottom: 6px;
      }

      .email-msg {
        max-width: 400px;
        width: fit-content;
        margin-bottom: 15px;
      }

      .send {
        display: flex;
        margin-bottom: 6px;

        .send-name {
          color: var(--regular-text-color);
          display: flex;
          flex-wrap: wrap;
        }

        .send-name-title {
          padding-right: 5px;
        }
      }

      .receive {
        margin-bottom: 6px;
        display: flex;
        .receive-email {
          max-width: 700px;
          word-break: break-word;
        }
        span:nth-child(2) {
          color: var(--regular-text-color);
        }
      }

      .send-source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }

      .source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }
    }
  }
}

.shadow-html::after  {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--message-block-color); /* 半透明黑色蒙层 */
  pointer-events: none; /* 不影响点击 */
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.bottom-distance {
  margin-bottom: 30px;
}


</style>
