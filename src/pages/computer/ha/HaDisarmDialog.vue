<script setup lang="ts">
import { useDialogPluginComponent } from 'quasar';
import { computed } from 'vue';
import UWindow from '@/components/UWindow.vue';
import { gettext } from '@/locale';

const props = defineProps<{ mode: 'freeze' | 'ignore' }>();
defineEmits([...useDialogPluginComponent.emits]);
const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();
const modeLabel = computed(() => gettext(props.mode === 'freeze' ? 'Freeze' : 'Ignore'));
</script>

<template>
  <q-dialog
    ref="dialogRef"
    persistent
    transition-show="scale"
    transition-hide="scale"
    @hide="onDialogHide"
  >
    <u-window
      width="560px"
      :title="gettext('Disarm HA') + ': ' + modeLabel"
    >
      <div class="ha-disarm-content">
        <p class="ha-disarm-question">
          {{
            gettext("Are you sure you want to disarm HA with resource mode '{0}'?").replace(
              '{0}',
              modeLabel
            )
          }}
        </p>
        <p class="ha-disarm-description">
          {{
            gettext(
              mode === 'freeze'
                ? 'This will freeze all services allowing no change to their operational state.'
                : 'The HA stack will be completely bypassed when the operational state of a service changes.'
            )
          }}
        </p>
        <div class="ha-disarm-warning">
          <q-icon
            name="warning"
            size="20px"
            color="warning"
          />
          <span>
            {{
              gettext(
                'While disarmed, HA does not protect your services. Failures during this period are not automatically recovered.'
              )
            }}
          </span>
        </div>
      </div>
      <template #foot>
        <q-btn
          no-caps
          outline
          size="12px"
          class="u-button"
          :label="gettext('Cancel')"
          @click="onDialogCancel"
        />
        <q-btn
          no-caps
          flat
          size="12px"
          class="bg-primary text-grey-1 u-button"
          :label="gettext('Confirm')"
          @click="onDialogOK()"
        />
      </template>
    </u-window>
  </q-dialog>
</template>

<style scoped lang="scss">
.ha-disarm-content {
  padding: 20px;
  color: #333;
  font-size: 13px;
  line-height: 1.7;
}
.ha-disarm-question {
  margin: 0 0 10px;
  font-weight: 600;
}
.ha-disarm-description {
  margin: 0 0 16px;
  color: #666;
}
.ha-disarm-warning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-left: 3px solid #fc0;
  background: #fffbea;
}
.ha-disarm-warning .q-icon {
  flex: 0 0 auto;
  margin-top: 1px;
}
</style>
