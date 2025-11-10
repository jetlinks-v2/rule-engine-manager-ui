export default {
    components: {
        AlarmDashboard: defineAsyncComponent(() => import('./views/DashBoard/index.vue')),
        AlarmConfig: defineAsyncComponent(() => import('./views/Alarm/Config/index.vue'))
    }
}

