<template><ProcessTemplateManager :api="processApi" :editable="auth.hasPermission('rule-engine/ProcessTemplate:save')" @apply="apply" /></template>
<script setup lang="ts">
import ProcessTemplateManager from '@jetlinks-web-core/components/Process/ProcessTemplateManager.vue'
import { useAuthStore } from '@jetlinks-web-core/store'
import { useProjectRouter } from '@jetlinks-web-core/hooks'
import { processApi } from '../../api/process'
const auth = useAuthStore(), router = useProjectRouter()
function apply(template: {id:string;version:string}) { void router.push({path:'/rule-engine/processes',query:{processTemplate:template.id,processVersion:template.version}}) }
</script>
