<script setup lang="ts">
import { Dialog, Notify } from 'quasar';
import type { QForm, QTableColumn } from 'quasar';
import { computed, reactive, ref } from 'vue';

type DemoRecord = {
  id: number;
  name: string;
  category: string;
  owner: string;
  status: '启用' | '停用';
  updatedAt: string;
  description: string;
};

type DemoForm = Omit<DemoRecord, 'id' | 'updatedAt'>;

const categoryOptions = ['基础设施', '应用服务', '数据服务'];
const statusOptions: DemoRecord['status'][] = ['启用', '停用'];
const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const selected = ref<DemoRecord[]>([]);
const filter = ref('');
const formRef = ref<QForm>();
const rows = ref<DemoRecord[]>([
  {
    id: 1,
    name: '生产集群',
    category: '基础设施',
    owner: '运维组',
    status: '启用',
    updatedAt: '2026-09-22 09:30',
    description: '承载核心生产业务的虚拟化集群。',
  },
  {
    id: 2,
    name: '监控平台',
    category: '应用服务',
    owner: '平台组',
    status: '启用',
    updatedAt: '2026-09-21 16:42',
    description: '统一采集主机、服务及业务指标。',
  },
  {
    id: 3,
    name: '归档存储',
    category: '数据服务',
    owner: '数据组',
    status: '停用',
    updatedAt: '2026-09-19 11:08',
    description: '用于历史数据归档的对象存储资源。',
  },
  {
    id: 4,
    name: '测试集群',
    category: '基础设施',
    owner: '研发组',
    status: '启用',
    updatedAt: '2026-09-18 14:20',
    description: '用于版本验证和功能联调的测试资源。',
  },
  {
    id: 5,
    name: '日志中心',
    category: '应用服务',
    owner: '平台组',
    status: '启用',
    updatedAt: '2026-09-18 10:15',
    description: '集中检索和分析平台服务日志。',
  },
  {
    id: 6,
    name: '备份仓库',
    category: '数据服务',
    owner: '运维组',
    status: '启用',
    updatedAt: '2026-09-17 18:36',
    description: '保存虚拟机和容器的周期备份。',
  },
]);
const form = reactive<DemoForm>(createEmptyForm());
const columns: QTableColumn<DemoRecord>[] = [
  { name: 'name', label: '名称', field: 'name', align: 'left', sortable: true },
  { name: 'category', label: '分类', field: 'category', align: 'left', sortable: true },
  { name: 'owner', label: '负责人', field: 'owner', align: 'left', sortable: true },
  { name: 'status', label: '状态', field: 'status', align: 'left', sortable: true },
  { name: 'updatedAt', label: '更新时间', field: 'updatedAt', align: 'left', sortable: true },
];
const dialogTitle = computed(() => (editingId.value === null ? '新增记录' : '编辑记录'));

function createEmptyForm(): DemoForm {
  return { name: '', category: '基础设施', owner: '', status: '启用', description: '' };
}

function resetForm(record?: DemoRecord) {
  Object.assign(
    form,
    record
      ? {
          name: record.name,
          category: record.category,
          owner: record.owner,
          status: record.status,
          description: record.description,
        }
      : createEmptyForm()
  );
}

function openCreateDialog() {
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEditDialog(record = selected.value[0]) {
  if (!record) return;
  editingId.value = record.id;
  resetForm(record);
  dialogVisible.value = true;
}

async function saveRecord() {
  const valid = await formRef.value?.validate();
  if (!valid) return;
  const updatedAt = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(/\//g, '-');
  const isCreate = editingId.value === null;
  if (isCreate) {
    const id = Math.max(...rows.value.map((row) => row.id), 0) + 1;
    rows.value = [...rows.value, { id, updatedAt, ...form }];
  } else {
    rows.value = rows.value.map((row) =>
      row.id === editingId.value ? { ...row, ...form, updatedAt } : row
    );
  }
  dialogVisible.value = false;
  Notify.create({
    type: 'positive',
    message: isCreate ? '记录已新增' : '记录已保存',
    position: 'top',
  });
}

function removeSelected() {
  const record = selected.value[0];
  if (!record) return;
  Dialog.create({
    title: '删除记录',
    message: `确定要删除“${record.name}”吗？`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    rows.value = rows.value.filter((row) => row.id !== record.id);
    selected.value = [];
    Notify.create({ type: 'positive', message: '记录已删除', position: 'top' });
  });
}
</script>

<template>
  <q-page class="standard-styles-page">
    <header class="standard-styles-page__header">
      <div>
        <h1>标准样式</h1>
        <p>使用 Quasar 原版组件样式的表格与表单弹窗测试页</p>
      </div>
    </header>

    <q-table
      v-model:selected="selected"
      class="standard-styles-table"
      :rows="rows"
      :columns="columns"
      row-key="id"
      selection="single"
      :filter="filter"
      :pagination="{ rowsPerPage: 10 }"
      flat
      bordered
    >
      <template #top>
        <q-toolbar class="standard-styles-table__toolbar q-pa-none">
          <div>
            <div class="text-subtitle1 text-weight-medium">资源列表示例</div>
            <div class="text-caption text-grey-7">共 {{ rows.length }} 条测试记录</div>
          </div>
          <q-space />
          <div class="standard-styles-table__search-wrap">
            <q-input
              v-model="filter"
              outlined
              dense
              debounce="300"
              placeholder="搜索名称、分类或负责人"
              class="standard-styles-table__search"
              clearable
            >
              <template #append><q-icon name="search" /></template>
            </q-input>
          </div>
          <div class="row no-wrap q-gutter-sm q-ml-md">
            <q-btn
              color="primary"
              no-caps
              icon="add"
              label="新增"
              @click="openCreateDialog"
            />
            <q-btn
              color="primary"
              outline
              no-caps
              icon="edit"
              label="编辑"
              :disable="selected.length !== 1"
              @click="openEditDialog()"
            />
            <q-btn
              color="negative"
              outline
              no-caps
              icon="delete"
              label="删除"
              :disable="selected.length !== 1"
              @click="removeSelected"
            />
          </div>
        </q-toolbar>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            rounded
            :color="props.value === '启用' ? 'positive' : 'grey'"
            :label="props.value"
          />
        </q-td>
      </template>

      <template #no-data>
        <div class="full-width row flex-center q-gutter-sm q-pa-xl text-grey-7">
          <q-icon
            name="inbox"
            size="28px"
          />
          <span>没有匹配的测试记录</span>
        </div>
      </template>
    </q-table>

    <q-dialog v-model="dialogVisible">
      <q-card
        class="standard-style-dialog"
        role="dialog"
        :aria-label="dialogTitle"
      >
        <q-card-section class="row items-center">
          <div class="text-h6">{{ dialogTitle }}</div>
          <q-space />
          <q-btn
            v-close-popup
            icon="close"
            flat
            round
            dense
            aria-label="关闭"
          />
        </q-card-section>
        <q-separator />
        <q-card-section>
          <q-form
            ref="formRef"
            class="q-gutter-y-md"
            @submit="saveRecord"
          >
            <div class="row q-col-gutter-md">
              <div class="col-12 col-sm-7">
                <q-input
                  v-model="form.name"
                  autofocus
                  label="名称"
                  :rules="[(value) => Boolean(value) || '请输入名称']"
                />
              </div>
              <div class="col-12 col-sm-5">
                <q-select
                  v-model="form.status"
                  :options="statusOptions"
                  label="状态"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-select
                  v-model="form.category"
                  :options="categoryOptions"
                  label="分类"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="form.owner"
                  label="负责人"
                  :rules="[(value) => Boolean(value) || '请输入负责人']"
                />
              </div>
            </div>
            <q-input
              v-model="form.description"
              type="textarea"
              autogrow
              label="说明"
            />
          </q-form>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right">
          <q-btn
            v-close-popup
            flat
            label="取消"
          />
          <q-btn
            color="primary"
            label="保存"
            @click="saveRecord"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped>
.standard-styles-page {
  padding: 14px;
}
.standard-styles-page__header {
  min-height: 50px;
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
.standard-styles-page__header h1,
.standard-styles-page__header p {
  margin: 0;
}
.standard-styles-page__header h1 {
  color: #1f2937;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
}
.standard-styles-page__header p {
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 13px;
}
.standard-styles-table__toolbar {
  min-height: 48px;
  padding: 12px 16px;
}
.standard-styles-table__search {
  width: 260px;
}
.standard-styles-table__search-wrap {
  display: flex;
  align-items: center;
}
.standard-style-dialog {
  width: 500px;
  max-width: 92vw;
  border-radius: 4px !important;
}
@media (max-width: 599px) {
  .standard-styles-page {
    padding: 16px;
  }
  .standard-styles-table__toolbar {
    height: auto;
    min-height: 0;
    padding: 12px 0 !important;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .standard-styles-table__search-wrap {
    width: 100%;
    margin-top: 12px;
  }
  .standard-styles-table__search {
    width: 100%;
  }
  .standard-styles-table__toolbar > .q-ml-md {
    margin-top: 12px;
    margin-left: 0 !important;
  }
}
</style>
