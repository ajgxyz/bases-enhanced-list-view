# Enhanced List View for Obsidian Bases

A mobile-optimized list view plugin for [Obsidian Bases](https://obsidian.md) with thumbnails, previews, tags, and two-level grouping support.

## Features

- **Rich List Items**: Thumbnails, preview text, tags, and metadata display
- **Two-Level Grouping**: Group and sub-group entries by any property
- **Configurable Subtitle**: Show parent folder or any property value alongside the title
- **Multiple Size Options**: Compact, comfortable, and cozy item sizes
- **Collapsible Groups**: Expand/collapse groups and sub-groups independently
- **Mobile Optimized**: Touch-friendly targets and responsive layout
- **Theme Support**: Works with light and dark themes

## Configuration Options

| Option | Description |
|--------|-------------|
| **Group by** | Primary grouping property |
| **Sub-group by** | Secondary grouping property (nested within primary groups) |
| **Item size** | Compact, Comfortable, or Cozy |
| **Preview lines** | Number of preview text lines (0-5) |
| **Show thumbnails** | Display thumbnail images from frontmatter or embedded images |
| **Thumbnail size** | Small, Medium, or Large |
| **Show tags** | Display frontmatter and inline tags |
| **Show subtitle** | Display a subtitle next to the title |
| **Subtitle source** | Property to use for subtitle (e.g., parent folder, category) |
| **Show metadata** | Display modified date and word count |
| **Collapsible groups** | Allow groups to be collapsed |
| **Show group counts** | Display entry count in group headers |

## Installation

### Manual Installation

1. Download the latest release
2. Extract to your vault's `.obsidian/plugins/enhanced-list-view/` folder
3. Enable the plugin in Obsidian Settings > Community Plugins

### From Source

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugins folder.

## Requirements

- Obsidian v1.8.0 or higher
- Obsidian Bases enabled

## License

MIT
