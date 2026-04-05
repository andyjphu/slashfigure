# Tabulator

- **Full Name:** Tabulator -- Interactive Tables and Data Grids
- **URL:** https://github.com/olifolkerd/tabulator
- **Stars:** ~7,603
- **License:** MIT

## What It Does
Framework-agnostic interactive table/grid. Sorting, filtering, editing, pagination, grouping. Zero dependencies.

## Key for Our Project
- **Export to JSON, CSV, XLSX, PDF, HTML** built-in
- **Custom download formatters** let you write a LaTeX `tabular` exporter trivially
- **MIT, zero dependencies** -- embeddable anywhere

```javascript
table.download("csv", "data.csv");
table.getData(); // raw data array
// Custom LaTeX exporter via formatter API
```

## Key Insight
Best candidate for the table component in our drawing app. The custom export API makes LaTeX table export straightforward. Combine with LaTeX Table Editor's serialization logic for the conversion.
