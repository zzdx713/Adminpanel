<script setup lang="ts">
/**
 * PermissionGuard - Hides or disables elements based on RBAC permissions
 *
 * Usage:
 *   <PermissionGuard action="delete" resource="session">
 *     <NButton @click="deleteSession">Delete</NButton>
 *   </PermissionGuard>
 *
 *   <PermissionGuard action="write" resource="config" fallback="hidden|disabled|readonly">
 *     <NInput v-model="value" />
 *   </PermissionGuard>
 */
import { computed } from 'vue'
import { useRbacStore } from '@/stores/rbac'

const props = withDefaults(defineProps<{
  action: string
  resource: string
  fallback?: 'hidden' | 'disabled' | 'readonly'
}>(), {
  fallback: 'hidden',
})

const rbacStore = useRbacStore()

const allowed = computed(() => rbacStore.canDo(props.action, props.resource))
</script>

<template>
  <template v-if="allowed">
    <slot />
  </template>
  <template v-else-if="fallback === 'disabled'">
    <slot name="disabled">
      <div class="permission-disabled-wrapper">
        <slot />
      </div>
    </slot>
  </template>
  <template v-else-if="fallback === 'readonly'">
    <slot name="readonly" />
  </template>
  <!-- fallback === 'hidden': render nothing -->
</template>

<style scoped>
.permission-disabled-wrapper {
  opacity: 0.5;
  pointer-events: none;
  cursor: not-allowed;
}
</style>
