<template>
  <article class="metric-card-shell">
    <slot name="drag" />
    <header class="metric-card-shell__head">
      <span class="metric-card-shell__icon"><AIcon :type="icon || 'DashboardOutlined'" /></span>
      <span class="metric-card-shell__title" :title="title">{{ title }}</span>
      <slot name="actions" />
    </header>
    <slot />
  </article>
</template>
<script setup lang="ts">
defineProps<{title:string;icon?:string}>()
</script>
<style scoped>
.metric-card-shell{position:relative;display:flex;flex-direction:column;min-width:0;height:100%;border:1px solid var(--line);border-radius:var(--r-3,8px);background:var(--panel-background);overflow:hidden}
.metric-card-shell:hover{border-color:var(--accent)}
.metric-card-shell__head{display:flex;align-items:center;gap:6px;padding:12px 12px 0 16px;min-width:0;min-height:44px}
.metric-card-shell__icon{display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);width:26px;height:26px;border-radius:6px;flex:none}
.metric-card-shell__title{min-width:0;flex:1;font-size:var(--fs-14,14px);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.metric-card-shell__head :deep(.ant-btn-text){display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;min-width:28px;height:28px;padding:0;border-radius:6px}
.metric-card-shell__head :deep(.ant-btn-text:not(:disabled)){color:var(--ink-3)}
.metric-card-shell__head :deep(.ant-btn-text:not(:disabled):hover),.metric-card-shell__head :deep(.ant-dropdown-open){color:var(--ink-1);background:var(--bg-sunken)}
.metric-card-shell__head :deep(.ant-btn-text:focus-visible){outline:2px solid var(--accent);outline-offset:1px}
.metric-card-shell__head :deep(.metric-star.is-featured){color:var(--ant-warning-color,#d99a10)}
.metric-card-shell :deep(.metric-order-handle){position:absolute;z-index:1;top:0;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;justify-content:center;width:40px;height:20px;padding:0;border:0;border-radius:0 0 6px 6px;background:none;color:var(--ink-3);cursor:grab;touch-action:none;opacity:0}
.metric-card-shell :deep(.metric-order-handle .anticon){font-size:12px}
.metric-card-shell :deep(.metric-order-handle .anticon-holder){transform:rotate(90deg)}
.metric-card-shell:hover :deep(.metric-order-handle),.metric-card-shell:focus-within :deep(.metric-order-handle){opacity:1}
.metric-card-shell :deep(.metric-order-handle.is-saving){opacity:1;cursor:progress}
.metric-card-shell :deep(.metric-order-handle:active){cursor:grabbing}.metric-card-shell :deep(.metric-order-handle:focus-visible){outline:2px solid var(--accent);outline-offset:-2px}
@media(hover:none){.metric-card-shell :deep(.metric-order-handle){height:24px;opacity:1}.metric-card-shell:has(.metric-order-handle) .metric-card-shell__head{padding-top:24px}}
</style>
