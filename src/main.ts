import {
	Plugin,
	BasesView,
	QueryController,
	BasesEntryGroup,
	BasesEntry,
	BasesPropertyId,
	parsePropertyId,
	Keymap,
	HoverParent,
	HoverPopover,
	ViewOption,
	DropdownOption,
	SliderOption,
	ToggleOption,
	PropertyOption,
} from "obsidian";

// View type identifier
export const ENHANCED_LIST_VIEW_TYPE = "enhanced-list-view";

// Special value for parent folder in subtitle property
const SUBTITLE_PARENT_FOLDER = "file.folder";

// Default settings
const DEFAULT_SETTINGS = {
	previewLines: 2,
	showThumbnails: true,
	thumbnailSize: "medium",
	showTags: true,
	showSubtitle: false,
	subtitleProperty: SUBTITLE_PARENT_FOLDER,
	showMetadata: true,
	itemSize: "comfortable",
	collapsibleGroups: true,
	showGroupCounts: true,
};

export default class EnhancedListViewPlugin extends Plugin {
	async onload() {
		// Register the enhanced list view with Bases
		this.registerBasesView(ENHANCED_LIST_VIEW_TYPE, {
			name: "Enhanced list",
			icon: "lucide-list",
			factory: (controller: QueryController, containerEl: HTMLElement) => {
				return new EnhancedListBasesView(controller, containerEl);
			},
			options: (): ViewOption[] => [
				// Grouping options (use unique key names to avoid conflict with Bases internals)
				{
					type: "property",
					displayName: "Group by",
					key: "primaryGroup",
					placeholder: "Select property for grouping (optional)",
					filter: (prop: string) => {
						// Show note, file, and formula properties
						return prop.startsWith("note.") || prop.startsWith("file.") || prop.startsWith("formula.");
					},
				} as PropertyOption,
				{
					type: "property",
					displayName: "Sub-group by",
					key: "subGroup",
					placeholder: "Select property for sub-grouping (optional)",
					filter: (prop: string) => {
						// Show note, file, and formula properties
						return prop.startsWith("note.") || prop.startsWith("file.") || prop.startsWith("formula.");
					},
				} as PropertyOption,
				// Layout options
				{
					type: "dropdown",
					displayName: "Item size",
					key: "itemSize",
					default: DEFAULT_SETTINGS.itemSize,
					options: {
						compact: "Compact",
						comfortable: "Comfortable",
						cozy: "Cozy",
					},
				} as DropdownOption,
				{
					type: "slider",
					displayName: "Preview lines",
					key: "previewLines",
					default: DEFAULT_SETTINGS.previewLines,
					min: 0,
					max: 5,
				} as SliderOption,
				{
					type: "toggle",
					displayName: "Show thumbnails",
					key: "showThumbnails",
					default: DEFAULT_SETTINGS.showThumbnails,
				} as ToggleOption,
				{
					type: "dropdown",
					displayName: "Thumbnail size",
					key: "thumbnailSize",
					default: DEFAULT_SETTINGS.thumbnailSize,
					options: {
						small: "Small",
						medium: "Medium",
						large: "Large",
					},
					shouldHide: (config) => !config.get("showThumbnails"),
				} as DropdownOption,
				{
					type: "toggle",
					displayName: "Show tags",
					key: "showTags",
					default: DEFAULT_SETTINGS.showTags,
				} as ToggleOption,
				{
					type: "toggle",
					displayName: "Show subtitle",
					key: "showSubtitle",
					default: DEFAULT_SETTINGS.showSubtitle,
				} as ToggleOption,
				{
					type: "property",
					displayName: "Subtitle source",
					key: "subtitleProperty",
					placeholder: "Select property for subtitle",
					default: DEFAULT_SETTINGS.subtitleProperty,
					filter: (prop: string) => {
						// Show note, file, and formula properties
						return prop.startsWith("note.") || prop.startsWith("file.") || prop.startsWith("formula.");
					},
					shouldHide: (config) => !config.get("showSubtitle"),
				} as PropertyOption,
				{
					type: "toggle",
					displayName: "Show metadata",
					key: "showMetadata",
					default: DEFAULT_SETTINGS.showMetadata,
				} as ToggleOption,
				{
					type: "toggle",
					displayName: "Collapsible groups",
					key: "collapsibleGroups",
					default: DEFAULT_SETTINGS.collapsibleGroups,
				} as ToggleOption,
				{
					type: "toggle",
					displayName: "Show group counts",
					key: "showGroupCounts",
					default: DEFAULT_SETTINGS.showGroupCounts,
				} as ToggleOption,
			],
		});
	}

	onunload() {
		// Cleanup handled by Obsidian
	}
}

/**
 * Enhanced List Bases View
 * Renders entries as a rich list with thumbnails, previews, tags, and metadata
 */
class EnhancedListBasesView extends BasesView implements HoverParent {
	readonly type = ENHANCED_LIST_VIEW_TYPE;
	private containerEl: HTMLElement;
	private collapsedGroups: Set<string> = new Set();
	private collapsedSubGroups: Set<string> = new Set();

	hoverPopover: HoverPopover | null = null;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.containerEl = parentEl.createDiv("enhanced-list-container");
	}

	/**
	 * Called by Obsidian whenever data or configuration changes
	 */
	public onDataUpdated(): void {
		// Clear previous content
		this.containerEl.empty();

		// Get configuration values with defaults
		const itemSize = this.getConfigString("itemSize", DEFAULT_SETTINGS.itemSize);
		const previewLines = this.getConfigNumber("previewLines", DEFAULT_SETTINGS.previewLines);
		const showThumbnails = this.getConfigBoolean("showThumbnails", DEFAULT_SETTINGS.showThumbnails);
		const thumbnailSize = this.getConfigString("thumbnailSize", DEFAULT_SETTINGS.thumbnailSize);
		const showTags = this.getConfigBoolean("showTags", DEFAULT_SETTINGS.showTags);
		const showSubtitle = this.getConfigBoolean("showSubtitle", DEFAULT_SETTINGS.showSubtitle);
		const subtitleProperty = this.getConfigPropertyId("subtitleProperty") || DEFAULT_SETTINGS.subtitleProperty;
		const showMetadata = this.getConfigBoolean("showMetadata", DEFAULT_SETTINGS.showMetadata);
		const collapsibleGroups = this.getConfigBoolean("collapsibleGroups", DEFAULT_SETTINGS.collapsibleGroups);
		const showGroupCounts = this.getConfigBoolean("showGroupCounts", DEFAULT_SETTINGS.showGroupCounts);

		// Get grouping configuration (use unique key names to avoid conflict with Bases internals)
		const groupByProperty = this.getConfigPropertyId("primaryGroup");
		const subGroupByProperty = this.getConfigPropertyId("subGroup");

		// Set CSS variables for sizing
		this.containerEl.setAttribute("data-item-size", itemSize);
		this.containerEl.setAttribute("data-thumbnail-size", thumbnailSize);

		// Get property order from config
		const order = this.config.getOrder();

		// Collect all entries from Bases data
		const allEntries: BasesEntry[] = [];
		for (const group of this.data.groupedData) {
			allEntries.push(...group.entries);
		}

		// Render options
		const renderOptions = {
			order,
			previewLines,
			showThumbnails,
			showTags,
			showSubtitle,
			subtitleProperty,
			showMetadata,
			collapsibleGroups,
			showGroupCounts,
		};

		// Group entries by plugin-controlled grouping
		if (groupByProperty) {
			const groupedEntries = this.groupEntriesByProperty(allEntries, groupByProperty);

			for (const [groupKey, entries] of groupedEntries) {
				if (subGroupByProperty) {
					// Two-level grouping
					this.renderGroupWithSubGroups(groupKey, entries, subGroupByProperty, renderOptions);
				} else {
					// Single-level plugin grouping
					this.renderCustomGroup(groupKey, entries, renderOptions);
				}
			}
		} else if (subGroupByProperty) {
			// Only sub-grouping configured - treat it as primary grouping
			const groupedEntries = this.groupEntriesByProperty(allEntries, subGroupByProperty);

			for (const [groupKey, entries] of groupedEntries) {
				this.renderCustomGroup(groupKey, entries, renderOptions);
			}
		} else {
			// No plugin grouping - use native Bases grouping
			for (const group of this.data.groupedData) {
				this.renderGroup(group, renderOptions);
			}
		}

		// Handle empty state
		if (allEntries.length === 0) {
			this.containerEl.createDiv({
				cls: "enhanced-list-empty",
				text: "No items to display",
			});
		}
	}

	/**
	 * Helper to get string config value with default
	 */
	private getConfigString(key: string, defaultValue: string): string {
		const value = this.config.get(key);
		return typeof value === "string" ? value : defaultValue;
	}

	/**
	 * Helper to get number config value with default
	 */
	private getConfigNumber(key: string, defaultValue: number): number {
		const value = this.config.get(key);
		return typeof value === "number" ? value : defaultValue;
	}

	/**
	 * Helper to get boolean config value with default
	 */
	private getConfigBoolean(key: string, defaultValue: boolean): boolean {
		const value = this.config.get(key);
		return typeof value === "boolean" ? value : defaultValue;
	}

	/**
	 * Helper to get property ID from config
	 */
	private getConfigPropertyId(key: string): string | null {
		try {
			const value = this.config.getAsPropertyId(key);
			return value || null;
		} catch {
			return null;
		}
	}

	/**
	 * Group entries by a property value
	 */
	private groupEntriesByProperty(entries: BasesEntry[], propertyId: string): Map<string, BasesEntry[]> {
		const groups = new Map<string, BasesEntry[]>();

		for (const entry of entries) {
			const groupKey = this.getPropertyValueAsString(entry, propertyId);

			if (!groups.has(groupKey)) {
				groups.set(groupKey, []);
			}
			groups.get(groupKey)!.push(entry);
		}

		return groups;
	}

	/**
	 * Get property value as a string for grouping
	 */
	private getPropertyValueAsString(entry: BasesEntry, propertyId: string): string {
		try {
			const value = entry.getValue(propertyId as BasesPropertyId);
			if (value) {
				return this.valueToGroupString(value);
			}
		} catch {
			// Property might not exist
		}

		// Fallback to frontmatter for note properties
		if (propertyId.startsWith("note.")) {
			const propName = propertyId.slice(5); // Remove "note." prefix
			const cache = this.app.metadataCache.getFileCache(entry.file);
			if (cache?.frontmatter && propName in cache.frontmatter) {
				const value = cache.frontmatter[propName];
				return this.valueToGroupString(value);
			}
		}

		// Special handling for file.folder
		if (propertyId === "file.folder") {
			return entry.file.parent?.name || "Root";
		}

		return "None";
	}

	/**
	 * Convert a value to a string for grouping
	 */
	private valueToGroupString(value: any): string {
		if (value === null || value === undefined) {
			return "None";
		}

		// Handle Bases Value objects
		if (typeof value === "object" && typeof value.toString === "function") {
			const str = value.toString();
			if (!str || str === "null" || str === "undefined") {
				return "None";
			}
			return str;
		}

		if (typeof value === "string") {
			return value || "None";
		}

		if (typeof value === "number") {
			return String(value);
		}

		if (typeof value === "boolean") {
			return value ? "True" : "False";
		}

		if (Array.isArray(value)) {
			return value.length > 0 ? value.map(v => this.valueToGroupString(v)).join(", ") : "None";
		}

		return String(value);
	}

	/**
	 * Render a group with sub-groups
	 */
	private renderGroupWithSubGroups(
		groupKey: string,
		entries: BasesEntry[],
		subGroupProperty: string,
		options: {
			order: BasesPropertyId[];
			previewLines: number;
			showThumbnails: boolean;
			showTags: boolean;
			showSubtitle: boolean;
			subtitleProperty: string;
			showMetadata: boolean;
			collapsibleGroups: boolean;
			showGroupCounts: boolean;
		}
	): void {
		const groupEl = this.containerEl.createDiv("enhanced-list-group");
		groupEl.setAttribute("data-level", "primary");
		const isCollapsed = this.collapsedGroups.has(groupKey);

		// Render primary group header
		this.renderGroupHeader(groupEl, groupKey, entries.length, isCollapsed, options, "primary");

		if (isCollapsed) {
			groupEl.addClass("is-collapsed");
			return;
		}

		// Sub-group the entries
		const subGroups = this.groupEntriesByProperty(entries, subGroupProperty);

		for (const [subGroupKey, subEntries] of subGroups) {
			const compoundKey = `${groupKey}:${subGroupKey}`;
			const subGroupEl = groupEl.createDiv("enhanced-list-group");
			subGroupEl.setAttribute("data-level", "secondary");
			const isSubCollapsed = this.collapsedSubGroups.has(compoundKey);

			// Render sub-group header
			this.renderGroupHeader(subGroupEl, subGroupKey, subEntries.length, isSubCollapsed, options, "secondary", compoundKey);

			if (isSubCollapsed) {
				subGroupEl.addClass("is-collapsed");
				continue;
			}

			// Render entries
			const entriesEl = subGroupEl.createDiv("enhanced-list-entries");
			for (const entry of subEntries) {
				this.renderEntry(entriesEl, entry, options);
			}
		}
	}

	/**
	 * Render a custom group (plugin-controlled)
	 */
	private renderCustomGroup(
		groupKey: string,
		entries: BasesEntry[],
		options: {
			order: BasesPropertyId[];
			previewLines: number;
			showThumbnails: boolean;
			showTags: boolean;
			showSubtitle: boolean;
			subtitleProperty: string;
			showMetadata: boolean;
			collapsibleGroups: boolean;
			showGroupCounts: boolean;
		}
	): void {
		const groupEl = this.containerEl.createDiv("enhanced-list-group");
		const isCollapsed = this.collapsedGroups.has(groupKey);

		// Render group header
		this.renderGroupHeader(groupEl, groupKey, entries.length, isCollapsed, options, "primary");

		if (isCollapsed) {
			groupEl.addClass("is-collapsed");
			return;
		}

		// Render entries
		const entriesEl = groupEl.createDiv("enhanced-list-entries");
		for (const entry of entries) {
			this.renderEntry(entriesEl, entry, options);
		}
	}

	/**
	 * Render a group header
	 */
	private renderGroupHeader(
		groupEl: HTMLElement,
		title: string,
		count: number,
		isCollapsed: boolean,
		options: { collapsibleGroups: boolean; showGroupCounts: boolean },
		level: "primary" | "secondary",
		compoundKey?: string
	): void {
		const headerEl = groupEl.createDiv("enhanced-list-group-header");

		if (level === "secondary") {
			headerEl.addClass("is-sub-group");
		}

		// Collapse indicator
		if (options.collapsibleGroups) {
			const collapseIcon = headerEl.createSpan("enhanced-list-collapse-icon");
			collapseIcon.innerHTML = isCollapsed
				? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>'
				: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
			headerEl.addClass("is-collapsible");
		}

		// Group title
		headerEl.createSpan({
			cls: "enhanced-list-group-title",
			text: title,
		});

		// Group count
		if (options.showGroupCounts) {
			headerEl.createSpan({
				cls: "enhanced-list-group-count",
				text: `${count}`,
			});
		}

		// Click handler for collapse
		if (options.collapsibleGroups) {
			const groupKey = compoundKey || title;
			const collapsedSet = level === "secondary" ? this.collapsedSubGroups : this.collapsedGroups;

			headerEl.addEventListener("click", () => {
				if (isCollapsed) {
					collapsedSet.delete(groupKey);
				} else {
					collapsedSet.add(groupKey);
				}
				this.onDataUpdated();
			});
		}
	}

	/**
	 * Render a group of entries with header (for native Bases grouping)
	 */
	private renderGroup(
		group: BasesEntryGroup,
		options: {
			order: BasesPropertyId[];
			previewLines: number;
			showThumbnails: boolean;
			showTags: boolean;
			showSubtitle: boolean;
			subtitleProperty: string;
			showMetadata: boolean;
			collapsibleGroups: boolean;
			showGroupCounts: boolean;
		}
	): void {
		const groupEl = this.containerEl.createDiv("enhanced-list-group");
		const groupKey = group.hasKey() ? (group.key?.toString() ?? "__ungrouped__") : "__ungrouped__";
		const isCollapsed = this.collapsedGroups.has(groupKey);

		// Render group header if there's a group key
		if (group.hasKey()) {
			this.renderGroupHeader(
				groupEl,
				group.key?.toString() ?? "",
				group.entries.length,
				isCollapsed,
				options,
				"primary"
			);
		}

		// Don't render entries if collapsed
		if (isCollapsed && group.hasKey()) {
			groupEl.addClass("is-collapsed");
			return;
		}

		// Render entries
		const entriesEl = groupEl.createDiv("enhanced-list-entries");
		for (const entry of group.entries) {
			this.renderEntry(entriesEl, entry, options);
		}
	}

	/**
	 * Render a single list entry
	 */
	private renderEntry(
		container: HTMLElement,
		entry: BasesEntry,
		options: {
			order: BasesPropertyId[];
			previewLines: number;
			showThumbnails: boolean;
			showTags: boolean;
			showSubtitle: boolean;
			subtitleProperty: string;
			showMetadata: boolean;
		}
	): void {
		const itemEl = container.createDiv("enhanced-list-item");
		itemEl.setAttribute("draggable", "true");
		itemEl.setAttribute("tabindex", "0");

		// Make entire item clickable
		itemEl.addEventListener("click", (evt) => {
			// Don't trigger if clicking on a tag
			if ((evt.target as HTMLElement).closest(".enhanced-list-tag")) return;

			if (evt.button !== 0 && evt.button !== 1) return;
			evt.preventDefault();
			const path = entry.file.path;
			const modEvent = Keymap.isModEvent(evt);
			this.app.workspace.openLinkText(path, "", modEvent);
		});

		// Hover preview on the entire item
		itemEl.addEventListener("mouseover", (evt) => {
			this.app.workspace.trigger("hover-link", {
				event: evt,
				source: "bases",
				hoverParent: this,
				targetEl: itemEl,
				linktext: entry.file.path,
			});
		});

		// Keyboard support for item
		itemEl.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				const modEvent = Keymap.isModEvent(evt);
				this.app.workspace.openLinkText(entry.file.path, "", modEvent);
			}
		});

		// Thumbnail
		if (options.showThumbnails) {
			const thumbnail = this.getThumbnail(entry);
			if (thumbnail) {
				const thumbEl = itemEl.createDiv("enhanced-list-thumbnail");
				thumbEl.style.backgroundImage = `url('${thumbnail}')`;
			}
		}

		// Content area
		const contentEl = itemEl.createDiv("enhanced-list-content");

		// Title row
		const titleRow = contentEl.createDiv("enhanced-list-title-row");

		// File name/title
		const fileName = entry.file.basename;
		titleRow.createSpan({
			cls: "enhanced-list-title",
			text: fileName,
		});

		// Subtitle (parent folder or property)
		if (options.showSubtitle) {
			const subtitleText = this.getSubtitleText(entry, options.subtitleProperty);
			if (subtitleText) {
				titleRow.createSpan({
					cls: "enhanced-list-subtitle",
					text: subtitleText,
				});
			}
		}

		// Preview text
		if (options.previewLines > 0) {
			const preview = this.getPreview(entry, options.previewLines);
			if (preview) {
				contentEl.createDiv({
					cls: "enhanced-list-preview",
					text: preview,
				});
			}
		}

		// Tags
		if (options.showTags) {
			const tags = this.getTags(entry);
			if (tags.length > 0) {
				const tagsEl = contentEl.createDiv("enhanced-list-tags");
				for (const tag of tags) {
					const tagEl = tagsEl.createSpan({
						cls: "enhanced-list-tag",
						text: tag.startsWith("#") ? tag : `#${tag}`,
					});
					tagEl.addEventListener("click", (evt) => {
						evt.stopPropagation();
						// Could navigate to tag or filter - for now just prevent default
					});
				}
			}
		}

		// Properties from order
		const propsEl = contentEl.createDiv("enhanced-list-properties");
		for (const propertyId of options.order) {
			const { type, name } = parsePropertyId(propertyId);

			// Skip file.name as it's already the title
			if (name === "name" && type === "file") continue;

			const value = entry.getValue(propertyId);
			if (!value) continue;

			// Check if value is empty using toString() as fallback
			const valueStr = value.toString();
			if (!valueStr || valueStr === "null" || valueStr === "undefined") continue;

			const propEl = propsEl.createSpan("enhanced-list-property");
			propEl.createSpan({
				cls: "enhanced-list-property-label",
				text: name,
			});
			propEl.createSpan({
				cls: "enhanced-list-property-value",
				text: valueStr,
			});
		}

		// Metadata footer
		if (options.showMetadata) {
			const footerEl = contentEl.createDiv("enhanced-list-footer");

			// Modified date
			const mtime = entry.file.stat.mtime;
			footerEl.createSpan({
				cls: "enhanced-list-date",
				text: this.formatRelativeDate(mtime),
			});

			// Word count if available
			const wordCount = this.getWordCount(entry);
			if (wordCount !== null) {
				footerEl.createSpan({
					cls: "enhanced-list-word-count",
					text: `${wordCount.toLocaleString()} words`,
				});
			}
		}
	}

	/**
	 * Get thumbnail URL for entry
	 */
	private getThumbnail(entry: BasesEntry): string | null {
		// Try to get image from frontmatter
		const cache = this.app.metadataCache.getFileCache(entry.file);
		if (cache?.frontmatter) {
			// Check common frontmatter image fields
			const imageFields = ["image", "cover", "thumbnail", "banner", "feature_image"];
			for (const field of imageFields) {
				const value = cache.frontmatter[field];
				if (value && typeof value === "string") {
					// Handle internal links
					if (value.startsWith("[[") && value.endsWith("]]")) {
						const linkPath = value.slice(2, -2);
						const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, entry.file.path);
						if (linkedFile) {
							return this.app.vault.getResourcePath(linkedFile);
						}
					}
					// Handle relative paths
					else if (!value.startsWith("http")) {
						const resolved = this.app.metadataCache.getFirstLinkpathDest(value, entry.file.path);
						if (resolved) {
							return this.app.vault.getResourcePath(resolved);
						}
					}
					// External URLs
					else {
						return value;
					}
				}
			}
		}

		// Try to find first image in file content
		if (cache?.embeds) {
			for (const embed of cache.embeds) {
				if (embed.link && /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(embed.link)) {
					const linkedFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, entry.file.path);
					if (linkedFile) {
						return this.app.vault.getResourcePath(linkedFile);
					}
				}
			}
		}

		return null;
	}

	/**
	 * Get preview text for entry
	 */
	private getPreview(entry: BasesEntry, lines: number): string | null {
		const cache = this.app.metadataCache.getFileCache(entry.file);

		// Try frontmatter description/summary first
		if (cache?.frontmatter) {
			const descFields = ["description", "summary", "excerpt", "abstract"];
			for (const field of descFields) {
				if (cache.frontmatter[field]) {
					return this.truncateToLines(String(cache.frontmatter[field]), lines);
				}
			}
		}

		// Get content after frontmatter
		// Note: For POC we'll just show a placeholder - full implementation would read file
		return null;
	}

	/**
	 * Get tags for entry
	 */
	private getTags(entry: BasesEntry): string[] {
		const cache = this.app.metadataCache.getFileCache(entry.file);
		const tags: string[] = [];

		// From frontmatter tags
		if (cache?.frontmatter?.tags) {
			const fmTags = cache.frontmatter.tags;
			if (Array.isArray(fmTags)) {
				tags.push(...fmTags);
			} else if (typeof fmTags === "string") {
				tags.push(fmTags);
			}
		}

		// From inline tags
		if (cache?.tags) {
			for (const tagCache of cache.tags) {
				const tag = tagCache.tag.startsWith("#") ? tagCache.tag.slice(1) : tagCache.tag;
				if (!tags.includes(tag)) {
					tags.push(tag);
				}
			}
		}

		return tags;
	}

	/**
	 * Get word count for entry
	 */
	private getWordCount(entry: BasesEntry): number | null {
		const cache = this.app.metadataCache.getFileCache(entry.file);

		// Check frontmatter
		if (cache?.frontmatter?.word_count) {
			return Number(cache.frontmatter.word_count);
		}

		// Could calculate from file content - skip for POC
		return null;
	}

	/**
	 * Get subtitle text based on configured property
	 */
	private getSubtitleText(entry: BasesEntry, subtitleProperty: string): string | null {
		// Special handling for file.folder (parent folder)
		if (subtitleProperty === "file.folder" || subtitleProperty === SUBTITLE_PARENT_FOLDER) {
			return entry.file.parent?.name || null;
		}

		// Try to get property value from Bases
		try {
			const value = entry.getValue(subtitleProperty as BasesPropertyId);
			if (value) {
				const valueStr = value.toString();
				if (valueStr && valueStr !== "null" && valueStr !== "undefined") {
					return valueStr;
				}
			}
		} catch {
			// Property might not be a valid BasesPropertyId
		}

		// Fallback for note properties: try frontmatter directly
		if (subtitleProperty.startsWith("note.")) {
			const propName = subtitleProperty.slice(5); // Remove "note." prefix
			const cache = this.app.metadataCache.getFileCache(entry.file);
			if (cache?.frontmatter && propName in cache.frontmatter) {
				const value = cache.frontmatter[propName];
				if (value !== null && value !== undefined) {
					return String(value);
				}
			}
		}

		return null;
	}

	/**
	 * Format relative date
	 */
	private formatRelativeDate(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days === 0) {
			if (hours === 0) {
				if (minutes === 0) {
					return "Just now";
				}
				return `${minutes}m ago`;
			}
			return `${hours}h ago`;
		} else if (days === 1) {
			return "Yesterday";
		} else if (days < 7) {
			return `${days}d ago`;
		} else if (days < 30) {
			const weeks = Math.floor(days / 7);
			return `${weeks}w ago`;
		} else if (days < 365) {
			const months = Math.floor(days / 30);
			return `${months}mo ago`;
		} else {
			const years = Math.floor(days / 365);
			return `${years}y ago`;
		}
	}

	/**
	 * Truncate text to specified number of lines
	 */
	private truncateToLines(text: string, lines: number): string {
		// Strip HTML
		const stripped = text.replace(/<[^>]*>/g, "").trim();

		// Split into lines and take first N
		const allLines = stripped.split(/\r?\n/).filter((l) => l.trim());
		const truncated = allLines.slice(0, lines).join(" ");

		// Limit to ~150 chars per line
		const maxChars = lines * 80;
		if (truncated.length > maxChars) {
			return truncated.slice(0, maxChars).trim() + "...";
		}

		return truncated;
	}

	/**
	 * Cleanup on unload
	 */
	public onUnload(): void {
		this.containerEl.empty();
		this.collapsedGroups.clear();
	}
}
