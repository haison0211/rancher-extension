<script>
/**
 * Build-time replacement for @shell/components/FileDiff.vue (see ../vue.config.js).
 *
 * FileDiff is the YAML diff view of Rancher's YAML editor. It pulls in diff + diff2html + highlight.js,
 * which made up most of this extension's node-page chunk. The extension only reaches it through its
 * bundled copy of Rancher's table / drawer, where the YAML is shown read-only and no diff is rendered.
 * Editing YAML (and its diff view) always opens Rancher's own page, which uses Rancher's own FileDiff.
 */
export default {
  name: 'FileDiff',

  props: {
    filename:    { type: String, default: 'file.txt' },
    sideBySide:  { type: Boolean, default: false },
    orig:        { type: String, required: true },
    neu:         { type: String, required: true },
    autoResize:  { type: Boolean, default: true },
    footerSpace: { type: Number, default: 0 },
    minHeight:   { type: Number, default: 200 },
  },
};
</script>

<template>
  <p class="text-muted p-10">
    The diff view is not available here. Use "Edit YAML" on the resource to compare changes.
  </p>
</template>
