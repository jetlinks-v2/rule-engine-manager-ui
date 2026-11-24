<template><ProcessWorkspace :api="processApi" :selection="selection" :initial-template="initialTemplate" :permissions="permissions" @update:selection="select" @applied="consumeTemplate" /></template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ProcessWorkspace from '@jetlinks-web-core/components/Process/ProcessWorkspace.vue'
import type { ProcessObject } from '@jetlinks-web-core/components/Process/types'
import { useProjectRouter } from '@jetlinks-web-core/hooks'
import { processApi } from '../../api/process'
import { useProcessPermissions } from '../../hook/useProcessPermissions'
const permissions = useProcessPermissions(), route = useRoute(), router = useProjectRouter()
const selection = computed(() => typeof route.query.objectType === 'string' && typeof route.query.objectId === 'string' ? {type:route.query.objectType,id:route.query.objectId} : undefined)
const initialTemplate = computed(() => typeof route.query.processTemplate === 'string' && typeof route.query.processVersion === 'string' ? {id:route.query.processTemplate,version:route.query.processVersion} : undefined)
function select(object?: ProcessObject) {
  if (object?.type === selection.value?.type && object?.id === selection.value?.id) return
  void router.replace({path:route.path,query:{...route.query,objectType:object?.type,objectId:object?.id}})
}
function consumeTemplate() { const query = {...route.query}; delete query.processTemplate; delete query.processVersion; void router.replace({path:route.path,query}) }
</script>
