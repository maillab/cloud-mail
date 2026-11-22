import Dexie from "dexie";
import {useUserStore} from "@/store/user.js"
import { watch, shallowRef } from "vue";

const userStore = useUserStore();


let db =  shallowRef({})

function createDB() {
    // The database is per employee, so it cannot be opened before there is an
    // identity. Importing this module during startup must not throw.
    const email = userStore.user?.email;
    if (!email) return;
    db.value = new Dexie(email);
    db.value.version(1).stores({
        draft: '++draftId,createTime'
    })

    db.value.version(1).stores({
        att: 'draftId'
    })
}

createDB()

watch(() => userStore.user?.email,() => createDB())

export default db;