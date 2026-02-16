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
					displayName: "First group",
					key: "primaryGroup",
					placeholder: "Select property for grouping (optional)",
					filter: (prop: string) => {
						// Show note, file, and formula properties
						return prop.startsWith("note.") || prop.startsWith("file.") || prop.startsWith("formula.");
					},
				} as PropertyOption,
				{
					type: "property",
					displayName: "Second group",
					key: "subGroup",
					placeholder: "Select property for sub-grouping (optional)",
					filter: (prop: string) => {
						// Show note, file, and formula properties
						return prop.startsWith("note.") || prop.startsWith("file.") || prop.startsWith("formula.");
					},
				} as PropertyOption,
				// Layout options
				{
					type: "slider",
					displayName: "Preview lines",
					key: "previewLines",
					default: DEFAULT_SETTINGS.previewLines,
					min: 0,
					max: 5,
				} as SliderOption,
				{
					type: "property",
					displayName: "Preview source",
					key: "previewProperty",
					placeholder: "Default (description/summary/excerpt)",
					filter: (prop: string) => {
						return prop.startsWith("note.") || prop.startsWith("file.") || prop.startsWith("formula.");
					},
					shouldHide: (config) => config.get("previewLines") === 0,
				} as PropertyOption,
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
		const previewLines = this.getConfigNumber("previewLines", DEFAULT_SETTINGS.previewLines);
		const showThumbnails = this.getConfigBoolean("showThumbnails", DEFAULT_SETTINGS.showThumbnails);
		const thumbnailSize = this.getConfigString("thumbnailSize", DEFAULT_SETTINGS.thumbnailSize);
		const showTags = this.getConfigBoolean("showTags", DEFAULT_SETTINGS.showTags);
		const showSubtitle = this.getConfigBoolean("showSubtitle", DEFAULT_SETTINGS.showSubtitle);
		const subtitleProperty = this.getConfigPropertyId("subtitleProperty") || DEFAULT_SETTINGS.subtitleProperty;
		const previewProperty = this.getConfigPropertyId("previewProperty");
		const showMetadata = this.getConfigBoolean("showMetadata", DEFAULT_SETTINGS.showMetadata);
		const showGroupCounts = this.getConfigBoolean("showGroupCounts", DEFAULT_SETTINGS.showGroupCounts);

		// Get grouping configuration (use unique key names to avoid conflict with Bases internals)
		const groupByProperty = this.getConfigPropertyId("primaryGroup");
		const subGroupByProperty = this.getConfigPropertyId("subGroup");

		// Set CSS variables for sizing
		this.containerEl.setAttribute("data-thumbnail-size", thumbnailSize);

		// Get property order from config
		const order = this.config.getOrder();

		// Render options
		const renderOptions = {
			order,
			previewLines,
			previewProperty,
			showThumbnails,
			showTags,
			showSubtitle,
			subtitleProperty,
			showMetadata,
			showGroupCounts,
		};

		// Determine if native Bases grouping is active
		const hasNativeGrouping = this.data.groupedData.some(g => g.hasKey());
		const levelOffset = hasNativeGrouping ? 1 : 0;

		let totalEntries = 0;

		// Always iterate native groups first, then apply plugin grouping within each
		for (const nativeGroup of this.data.groupedData) {
			totalEntries += nativeGroup.entries.length;

			// Determine parent element and handle native group header/collapse
			let parentEl: HTMLElement;
			const nativeKey = nativeGroup.hasKey()
				? (nativeGroup.key?.toString() ?? "__ungrouped__")
				: "";

			if (nativeGroup.hasKey()) {
				// Render native group wrapper
				const nativeGroupEl = this.containerEl.createDiv("enhanced-list-group");
				nativeGroupEl.setAttribute("data-level", "primary");
				const isNativeCollapsed = this.collapsedGroups.has(nativeKey);

				this.renderGroupHeader(
					nativeGroupEl,
					this.stripWikilinks(nativeGroup.key?.toString() ?? ""),
					nativeGroup.entries.length,
					isNativeCollapsed,
					renderOptions,
					"primary"
				);

				if (isNativeCollapsed) {
					nativeGroupEl.addClass("is-collapsed");
					continue;
				}

				parentEl = nativeGroupEl;
			} else {
				parentEl = this.containerEl;
			}

			// Apply plugin grouping within this native group's entries
			if (groupByProperty) {
				const groupedEntries = this.groupEntriesByProperty(nativeGroup.entries, groupByProperty);

				for (const [groupKey, entries] of groupedEntries) {
					if (subGroupByProperty) {
						this.renderGroupWithSubGroups(parentEl, nativeKey, groupKey, entries, subGroupByProperty, levelOffset, renderOptions);
					} else {
						this.renderCustomGroup(parentEl, nativeKey, groupKey, entries, levelOffset, renderOptions);
					}
				}
			} else if (subGroupByProperty) {
				const groupedEntries = this.groupEntriesByProperty(nativeGroup.entries, subGroupByProperty);

				for (const [groupKey, entries] of groupedEntries) {
					this.renderCustomGroup(parentEl, nativeKey, groupKey, entries, levelOffset, renderOptions);
				}
			} else {
				// No plugin grouping — render entries directly
				const entriesEl = parentEl.createDiv("enhanced-list-entries");
				for (const entry of nativeGroup.entries) {
					this.renderEntry(entriesEl, entry, renderOptions);
				}
			}
		}

		// Handle empty state
		if (totalEntries === 0) {
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
			return this.stripWikilinks(str);
		}

		if (typeof value === "string") {
			return this.stripWikilinks(value) || "None";
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
	 * Strip wikilink brackets from a string for display purposes.
	 * Handles both simple [[Link]] and aliased [[Link|Alias]] formats.
	 */
	private stripWikilinks(str: string): string {
		return str.replace(/\[\[([^\]]+?)(?:\|([^\]]+))?\]\]/g, (_match, link, alias) => alias ?? link);
	}

	/**
	 * Render text with clickable wikilinks into a container.
	 * Non-link text becomes text nodes; wikilinks become clickable spans.
	 */
	private renderTextWithLinks(container: HTMLElement, text: string): void {
		const regex = /\[\[([^\]]+?)(?:\|([^\]]+))?\]\]/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			// Append plain text before this match
			if (match.index > lastIndex) {
				container.appendText(text.slice(lastIndex, match.index));
			}

			const linkPath = match[1];
			const displayText = match[2] ?? match[1];

			const linkSpan = container.createSpan({
				cls: "enhanced-list-link",
				text: displayText,
			});

			linkSpan.addEventListener("click", (evt) => {
				evt.stopPropagation();
				evt.preventDefault();
				this.app.workspace.openLinkText(linkPath, "", Keymap.isModEvent(evt));
			});

			linkSpan.addEventListener("mouseover", (evt) => {
				this.app.workspace.trigger("hover-link", {
					event: evt,
					source: "bases",
					hoverParent: this,
					targetEl: linkSpan,
					linktext: linkPath,
				});
			});

			lastIndex = regex.lastIndex;
		}

		// Append any remaining plain text
		if (lastIndex < text.length) {
			container.appendText(text.slice(lastIndex));
		}
	}

	/**
	 * Render a group with sub-groups
	 */
	private renderGroupWithSubGroups(
		parentEl: HTMLElement,
		nativeKey: string,
		groupKey: string,
		entries: BasesEntry[],
		subGroupProperty: string,
		levelOffset: number,
		options: {
			order: BasesPropertyId[];
			previewLines: number;
			previewProperty: string | null;
			showThumbnails: boolean;
			showTags: boolean;
			showSubtitle: boolean;
			subtitleProperty: string;
			showMetadata: boolean;
			showGroupCounts: boolean;
		}
	): void {
		const levels: Array<"primary" | "secondary" | "tertiary"> = ["primary", "secondary", "tertiary"];
		const primaryLevel = levels[levelOffset];
		const subLevel = levels[levelOffset + 1];

		const groupEl = parentEl.createDiv("enhanced-list-group");
		groupEl.setAttribute("data-level", primaryLevel);

		const collapseKey = nativeKey ? `${nativeKey}::${groupKey}` : groupKey;
		const primaryCollapsedSet = (primaryLevel === "secondary" || primaryLevel === "tertiary") ? this.collapsedSubGroups : this.collapsedGroups;
		const isCollapsed = primaryCollapsedSet.has(collapseKey);

		// Render primary group header
		this.renderGroupHeader(groupEl, groupKey, entries.length, isCollapsed, options, primaryLevel, collapseKey);

		if (isCollapsed) {
			groupEl.addClass("is-collapsed");
			return;
		}

		// Sub-group the entries
		const subGroups = this.groupEntriesByProperty(entries, subGroupProperty);

		for (const [subGroupKey, subEntries] of subGroups) {
			const compoundKey = nativeKey
				? `${nativeKey}::${groupKey}::${subGroupKey}`
				: `${groupKey}:${subGroupKey}`;
			const subGroupEl = groupEl.createDiv("enhanced-list-group");
			subGroupEl.setAttribute("data-level", subLevel);
			const isSubCollapsed = this.collapsedSubGroups.has(compoundKey);

			// Render sub-group header
			this.renderGroupHeader(subGroupEl, subGroupKey, subEntries.length, isSubCollapsed, options, subLevel, compoundKey);

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
		parentEl: HTMLElement,
		nativeKey: string,
		groupKey: string,
		entries: BasesEntry[],
		levelOffset: number,
		options: {
			order: BasesPropertyId[];
			previewLines: number;
			previewProperty: string | null;
			showThumbnails: boolean;
			showTags: boolean;
			showSubtitle: boolean;
			subtitleProperty: string;
			showMetadata: boolean;
			showGroupCounts: boolean;
		}
	): void {
		const levels: Array<"primary" | "secondary" | "tertiary"> = ["primary", "secondary", "tertiary"];
		const level = levels[levelOffset];

		const groupEl = parentEl.createDiv("enhanced-list-group");
		groupEl.setAttribute("data-level", level);

		const collapseKey = nativeKey ? `${nativeKey}::${groupKey}` : groupKey;
		const collapsedSet = (level === "secondary" || level === "tertiary") ? this.collapsedSubGroups : this.collapsedGroups;
		const isCollapsed = collapsedSet.has(collapseKey);

		// Render group header
		this.renderGroupHeader(groupEl, groupKey, entries.length, isCollapsed, options, level, collapseKey);

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
		options: { showGroupCounts: boolean },
		level: "primary" | "secondary" | "tertiary",
		compoundKey?: string
	): void {
		const headerEl = groupEl.createDiv("enhanced-list-group-header");

		if (level === "secondary" || level === "tertiary") {
			headerEl.addClass("is-sub-group");
		}

		// Collapse indicator
		const collapseIcon = headerEl.createSpan("enhanced-list-collapse-icon");
		collapseIcon.innerHTML = isCollapsed
			? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>'
			: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
		headerEl.addClass("is-collapsible");

		// Group title
		headerEl.createSpan({
			cls: "enhanced-list-group-title",
			text: this.stripWikilinks(title),
		});

		// Group count
		if (options.showGroupCounts) {
			headerEl.createSpan({
				cls: "enhanced-list-group-count",
				text: `${count}`,
			});
		}

		// Click handler for collapse
		const groupKey = compoundKey || title;
		const collapsedSet = (level === "secondary" || level === "tertiary") ? this.collapsedSubGroups : this.collapsedGroups;

		headerEl.addEventListener("click", () => {
			if (isCollapsed) {
				collapsedSet.delete(groupKey);
			} else {
				collapsedSet.add(groupKey);
			}
			this.onDataUpdated();
		});
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
			previewProperty: string | null;
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
			// Don't trigger if clicking on a tag or wikilink
			if ((evt.target as HTMLElement).closest(".enhanced-list-tag, .enhanced-list-link")) return;

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
			const preview = this.getPreview(entry, options.previewLines, options.previewProperty);
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
			const valueSpan = propEl.createSpan("enhanced-list-property-value");
			this.renderTextWithLinks(valueSpan, valueStr);
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
	private getPreview(entry: BasesEntry, lines: number, previewProperty: string | null): string | null {
		// If a specific preview property is configured, use it
		if (previewProperty) {
			// Try Bases getValue first
			try {
				const value = entry.getValue(previewProperty as BasesPropertyId);
				if (value) {
					const valueStr = value.toString();
					if (valueStr && valueStr !== "null" && valueStr !== "undefined") {
						return this.truncateToLines(this.stripWikilinks(valueStr), lines);
					}
				}
			} catch {
				// Property might not be a valid BasesPropertyId
			}

			// Fallback for note properties: try frontmatter directly
			if (previewProperty.startsWith("note.")) {
				const propName = previewProperty.slice(5);
				const cache = this.app.metadataCache.getFileCache(entry.file);
				if (cache?.frontmatter && propName in cache.frontmatter) {
					const value = cache.frontmatter[propName];
					if (value !== null && value !== undefined) {
						return this.truncateToLines(this.stripWikilinks(String(value)), lines);
					}
				}
			}

			return null;
		}

		// Default behavior: try common frontmatter description fields
		const cache = this.app.metadataCache.getFileCache(entry.file);
		if (cache?.frontmatter) {
			const descFields = ["description", "summary", "excerpt", "abstract"];
			for (const field of descFields) {
				if (cache.frontmatter[field]) {
					return this.truncateToLines(String(cache.frontmatter[field]), lines);
				}
			}
		}

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
					return this.stripWikilinks(valueStr);
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
					return this.stripWikilinks(String(value));
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
