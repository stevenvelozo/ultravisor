const libPictView = require('pict-view');
const libDocuserveProvider = require('pict-docuserve/source/providers/Pict-Provider-Docuserve-Documentation.js');

const _ViewConfiguration =
{
	ViewIdentifier: "Ultravisor-Documentation",

	DefaultRenderable: "Ultravisor-Documentation-Content",
	DefaultDestinationAddress: "#Ultravisor-Content-Container",

	AutoRender: false,

	CSS: /*css*/`
		.ultravisor-docs {
			display: flex;
			height: calc(100vh - 56px - 39px);
			min-height: 400px;
			overflow: hidden;
		}
		.ultravisor-docs-sidebar {
			flex-shrink: 0;
			width: 260px;
			background-color: var(--uv-bg-surface);
			border-right: 1px solid var(--uv-border-subtle);
			overflow-y: auto;
			display: flex;
			flex-direction: column;
		}
		.ultravisor-docs-sidebar-search {
			padding: 0.75em;
			border-bottom: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-docs-sidebar-search input {
			width: 100%;
			padding: 0.4em 0.6em;
			border: 1px solid var(--uv-border-subtle);
			border-radius: 4px;
			background: var(--uv-bg-elevated);
			color: var(--uv-text);
			font-size: 0.85em;
			outline: none;
			box-sizing: border-box;
		}
		.ultravisor-docs-sidebar-search input:focus {
			border-color: var(--uv-brand);
		}
		.ultravisor-docs-sidebar-search input::placeholder {
			color: var(--uv-text-tertiary);
		}
		.ultravisor-docs-search-results {
			margin-top: 0.5em;
		}
		.ultravisor-docs-search-results a {
			display: block;
			padding: 0.35em 0.5em;
			color: var(--uv-text-secondary);
			text-decoration: none;
			font-size: 0.8em;
			border-radius: 3px;
			cursor: pointer;
		}
		.ultravisor-docs-search-results a:hover {
			background-color: var(--uv-topbar-hover);
			color: #fff;
		}
		.ultravisor-docs-search-result-title {
			font-weight: 600;
			color: var(--uv-text);
		}
		.ultravisor-docs-search-results a:hover .ultravisor-docs-search-result-title {
			color: #fff;
		}
		.ultravisor-docs-search-result-meta {
			font-size: 0.9em;
			color: var(--uv-text-tertiary);
		}
		.ultravisor-docs-sidebar-nav {
			flex: 1;
			overflow-y: auto;
			padding: 0.5em 0;
		}
		.ultravisor-docs-sidebar-home {
			padding: 0.5em 1em;
		}
		.ultravisor-docs-sidebar-home a {
			color: var(--uv-link);
			text-decoration: none;
			font-weight: 600;
			font-size: 0.85em;
			cursor: pointer;
		}
		.ultravisor-docs-sidebar-home a:hover {
			color: var(--uv-link-hover);
		}
		.ultravisor-docs-sidebar-group {
			margin-top: 0.25em;
		}
		.ultravisor-docs-group-title {
			display: block;
			padding: 0.5em 1em;
			font-weight: 600;
			font-size: 0.8em;
			color: var(--uv-text-secondary);
			text-transform: uppercase;
			letter-spacing: 0.04em;
			cursor: pointer;
			text-decoration: none;
			transition: background-color 0.15s, color 0.15s;
		}
		.ultravisor-docs-group-title:hover {
			color: var(--uv-link);
			background-color: #1a2744;
		}
		.ultravisor-docs-group-title.active {
			color: var(--uv-link);
			background-color: var(--uv-bg-elevated);
		}
		.ultravisor-docs-module-list {
			list-style: none;
			margin: 0;
			padding: 0;
		}
		.ultravisor-docs-module-list a {
			display: block;
			padding: 0.3em 1em 0.3em 1.75em;
			color: var(--uv-text-secondary);
			text-decoration: none;
			font-size: 0.85em;
			cursor: pointer;
			transition: background-color 0.15s, color 0.15s;
		}
		.ultravisor-docs-module-list a:hover {
			background-color: #1a2744;
			color: #fff;
		}
		.ultravisor-docs-module-list a.active {
			color: var(--uv-link);
			font-weight: 600;
			background-color: var(--uv-bg-elevated);
		}
		.ultravisor-docs-module-list .no-docs {
			display: block;
			padding: 0.3em 1em 0.3em 1.75em;
			color: var(--uv-btn-secondary-bg);
			font-size: 0.85em;
		}
		.ultravisor-docs-content {
			flex: 1;
			min-width: 0;
			overflow-y: auto;
			background-color: var(--uv-bg-base);
		}
		.ultravisor-docs-body {
			padding: 2em 3em;
			max-width: 900px;
			margin: 0 auto;
		}
		.ultravisor-docs-loading {
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: 200px;
			color: var(--uv-text-tertiary);
			font-size: 1em;
		}
		/* Markdown content styling for dark theme */
		.ultravisor-docs-body h1 {
			font-size: 2em;
			color: var(--uv-text);
			border-bottom: 1px solid var(--uv-border-subtle);
			padding-bottom: 0.3em;
			margin-top: 0;
			font-weight: 300;
		}
		.ultravisor-docs-body h2 {
			font-size: 1.5em;
			color: var(--uv-text);
			border-bottom: 1px solid #1e3a5f;
			padding-bottom: 0.25em;
			margin-top: 1.5em;
			font-weight: 400;
		}
		.ultravisor-docs-body h3 {
			font-size: 1.25em;
			color: var(--uv-text);
			margin-top: 1.25em;
		}
		.ultravisor-docs-body h4,
		.ultravisor-docs-body h5,
		.ultravisor-docs-body h6 {
			color: var(--uv-text-secondary);
			margin-top: 1em;
		}
		.ultravisor-docs-body p {
			line-height: 1.7;
			color: var(--uv-text-secondary);
			margin: 0.75em 0;
		}
		.ultravisor-docs-body a {
			color: var(--uv-link);
			text-decoration: none;
		}
		.ultravisor-docs-body a:hover {
			text-decoration: underline;
			color: var(--uv-link-hover);
		}
		.ultravisor-docs-body pre {
			background: #0d1b2a;
			color: var(--uv-text);
			padding: 1.25em;
			border-radius: 6px;
			overflow-x: auto;
			line-height: 1.5;
			font-size: 0.9em;
			border: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-docs-body code {
			background: #0d1b2a;
			padding: 0.15em 0.4em;
			border-radius: 3px;
			font-size: 0.9em;
			color: var(--uv-brand);
		}
		.ultravisor-docs-body pre code {
			background: none;
			padding: 0;
			color: inherit;
			font-size: inherit;
		}
		.ultravisor-docs-body .pict-content-code-wrap {
			position: relative;
			font-family: 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', monospace;
			font-size: 14px;
			line-height: 1.5;
			border-radius: 6px;
			overflow: auto;
			margin: 1em 0;
			background: #0d1b2a;
			border: 1px solid var(--uv-border-subtle);
		}
		.ultravisor-docs-body .pict-content-code-wrap .pict-content-code-line-numbers {
			position: absolute;
			top: 0;
			left: 0;
			width: 40px;
			padding: 1.25em 0;
			text-align: right;
			background: #0a1525;
			border-right: 1px solid var(--uv-border-subtle);
			color: var(--uv-btn-secondary-bg);
			font-size: 13px;
			line-height: 1.5;
			user-select: none;
			pointer-events: none;
			box-sizing: border-box;
		}
		.ultravisor-docs-body .pict-content-code-wrap .pict-content-code-line-numbers span {
			display: block;
			padding: 0 8px 0 0;
		}
		.ultravisor-docs-body .pict-content-code-wrap pre {
			margin: 0;
			background: #0d1b2a;
			color: var(--uv-text);
			padding: 1.25em 1.25em 1.25em 52px;
			border-radius: 6px;
			overflow-x: auto;
			line-height: 1.5;
			font-size: inherit;
			border: none;
		}
		.ultravisor-docs-body .pict-content-code-wrap pre code {
			background: none;
			padding: 0;
			color: inherit;
			font-size: inherit;
			font-family: inherit;
		}
		.ultravisor-docs-body .pict-content-code-wrap .keyword { color: #C678DD; }
		.ultravisor-docs-body .pict-content-code-wrap .string { color: #98C379; }
		.ultravisor-docs-body .pict-content-code-wrap .number { color: #D19A66; }
		.ultravisor-docs-body .pict-content-code-wrap .comment { color: #546e7a; font-style: italic; }
		.ultravisor-docs-body .pict-content-code-wrap .operator { color: #56B6C2; }
		.ultravisor-docs-body .pict-content-code-wrap .punctuation { color: var(--uv-text); }
		.ultravisor-docs-body .pict-content-code-wrap .function-name { color: #61AFEF; }
		.ultravisor-docs-body .pict-content-code-wrap .property { color: #E06C75; }
		.ultravisor-docs-body .pict-content-code-wrap .tag { color: #E06C75; }
		.ultravisor-docs-body .pict-content-code-wrap .attr-name { color: #D19A66; }
		.ultravisor-docs-body .pict-content-code-wrap .attr-value { color: #98C379; }
		.ultravisor-docs-body blockquote {
			border-left: 4px solid var(--uv-brand);
			margin: 1em 0;
			padding: 0.5em 1em;
			background: var(--uv-bg-surface);
			color: var(--uv-text-secondary);
		}
		.ultravisor-docs-body blockquote p {
			margin: 0.25em 0;
		}
		.ultravisor-docs-body ul,
		.ultravisor-docs-body ol {
			padding-left: 2em;
			line-height: 1.8;
		}
		.ultravisor-docs-body li {
			margin: 0.25em 0;
			color: var(--uv-text-secondary);
		}
		.ultravisor-docs-body hr {
			border: none;
			border-top: 1px solid var(--uv-border-subtle);
			margin: 2em 0;
		}
		.ultravisor-docs-body table {
			width: 100%;
			border-collapse: collapse;
			margin: 1em 0;
		}
		.ultravisor-docs-body table th {
			background: var(--uv-bg-surface);
			border: 1px solid var(--uv-border-subtle);
			padding: 0.6em 0.8em;
			text-align: left;
			font-weight: 600;
			color: var(--uv-text);
		}
		.ultravisor-docs-body table td {
			border: 1px solid var(--uv-border-subtle);
			padding: 0.5em 0.8em;
			color: var(--uv-text-secondary);
		}
		.ultravisor-docs-body table tr:nth-child(even) {
			background: var(--uv-bg-surface);
		}
		.ultravisor-docs-body img {
			max-width: 100%;
			height: auto;
		}
		.ultravisor-docs-body strong {
			color: var(--uv-text);
		}
		.ultravisor-docs-not-found {
			text-align: center;
			padding: 3em 1em;
			color: var(--uv-text-tertiary);
		}
		.ultravisor-docs-not-found h2 {
			color: var(--uv-text-secondary);
			font-size: 1.5em;
			border-bottom: none;
		}
	`,

	Templates:
	[
		{
			Hash: "Ultravisor-Documentation-Template",
			Template: /*html*/`
<div class="ultravisor-docs">
	<div class="ultravisor-docs-sidebar">
		<div class="ultravisor-docs-sidebar-search" id="Ultravisor-Docs-Search-Container" style="display:none;">
			<input type="text" placeholder="Search docs..." id="Ultravisor-Docs-Search-Input">
			<div id="Ultravisor-Docs-Search-Results" class="ultravisor-docs-search-results"></div>
		</div>
		<div class="ultravisor-docs-sidebar-nav" id="Ultravisor-Docs-Sidebar-Nav">
			<div class="ultravisor-docs-loading">Loading...</div>
		</div>
	</div>
	<div class="ultravisor-docs-content">
		<div id="Ultravisor-Docs-Content-Body" class="ultravisor-docs-body">
			<div class="ultravisor-docs-loading">Loading documentation...</div>
		</div>
	</div>
</div>
`
		}
	],

	Renderables:
	[
		{
			RenderableHash: "Ultravisor-Documentation-Content",
			TemplateHash: "Ultravisor-Documentation-Template",
			DestinationAddress: "#Ultravisor-Content-Container",
			RenderMethod: "replace"
		}
	]
};

class UltravisorDocumentationView extends libPictView
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this._Initialized = false;
		this._SearchDebounceTimer = null;
	}

	/**
	 * Initialize the Docuserve provider and AppData state if not already done.
	 *
	 * @param {Function} fCallback - Called once initialization is complete
	 */
	_ensureInitialized(fCallback)
	{
		if (this._Initialized)
		{
			return fCallback();
		}

		// Initialize docuserve application state
		if (!this.pict.AppData.Docuserve)
		{
			this.pict.AppData.Docuserve =
			{
				CatalogLoaded: false,
				Catalog: null,
				CoverLoaded: false,
				Cover: null,
				SidebarLoaded: false,
				SidebarGroups: [],
				TopBarLoaded: false,
				TopBar: null,
				ErrorPageLoaded: false,
				ErrorPageHTML: null,
				KeywordIndexLoaded: false,
				KeywordDocumentCount: 0,
				CurrentGroup: '',
				CurrentModule: '',
				CurrentPath: '',
				SidebarVisible: true,
				DocsBaseURL: 'docs/',
				CatalogURL: 'docs/retold-catalog.json'
			};
		}

		// Register the docuserve documentation provider if not already done
		if (!this.pict.providers['Docuserve-Documentation'])
		{
			this.pict.addProvider('Docuserve-Documentation', libDocuserveProvider.default_configuration, libDocuserveProvider);
		}

		let tmpDocProvider = this.pict.providers['Docuserve-Documentation'];

		// Load catalog and optional files
		tmpDocProvider.loadCatalog(
			function ()
			{
				this._Initialized = true;
				return fCallback();
			}.bind(this));
	}

	onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent)
	{
		this._ensureInitialized(
			function ()
			{
				this._renderSidebar();

				// Set up search input
				let tmpSearchContainer = document.getElementById('Ultravisor-Docs-Search-Container');
				if (tmpSearchContainer && this.pict.AppData.Docuserve.KeywordIndexLoaded)
				{
					tmpSearchContainer.style.display = '';

					let tmpInput = document.getElementById('Ultravisor-Docs-Search-Input');
					if (tmpInput)
					{
						tmpInput.addEventListener('input',
							function ()
							{
								if (this._SearchDebounceTimer)
								{
									clearTimeout(this._SearchDebounceTimer);
								}
								this._SearchDebounceTimer = setTimeout(
									function ()
									{
										this._performSearch(tmpInput.value);
									}.bind(this), 250);
							}.bind(this));
					}
				}

				// Load the current page or default to the cover/overview
				let tmpCurrentPath = this.pict.AppData.Docuserve.CurrentPath;
				if (tmpCurrentPath)
				{
					this.navigateToPage(tmpCurrentPath);
				}
				else
				{
					// Show the overview page by default
					this.navigateToPage('overview');
				}
			}.bind(this));

		return super.onAfterRender(pRenderable, pRenderDestinationAddress, pRecord, pContent);
	}

	/**
	 * Render the sidebar navigation from the parsed SidebarGroups data.
	 */
	_renderSidebar()
	{
		let tmpGroups = this.pict.AppData.Docuserve.SidebarGroups;
		let tmpCurrentPath = this.pict.AppData.Docuserve.CurrentPath;

		let tmpHTML = '';

		// Home link
		tmpHTML += '<div class="ultravisor-docs-sidebar-home">';
		tmpHTML += '<a onclick="_Pict.views[\'Ultravisor-Documentation\'].navigateToPage(\'overview\')">Documentation</a>';
		tmpHTML += '</div>';

		if (!tmpGroups || tmpGroups.length < 1)
		{
			this.pict.ContentAssignment.assignContent('#Ultravisor-Docs-Sidebar-Nav', tmpHTML);
			return;
		}

		for (let i = 0; i < tmpGroups.length; i++)
		{
			let tmpGroup = tmpGroups[i];
			tmpHTML += '<div class="ultravisor-docs-sidebar-group">';

			// Group title
			let tmpGroupActive = '';
			if (tmpGroup.Modules && tmpGroup.Modules.length > 0)
			{
				// Check if any child module is active
				for (let k = 0; k < tmpGroup.Modules.length; k++)
				{
					if (tmpGroup.Modules[k].Route && this._isRouteActive(tmpGroup.Modules[k].Route))
					{
						tmpGroupActive = ' active';
						break;
					}
				}
			}

			// Determine group click action
			let tmpGroupClickPath = this._extractPagePath(tmpGroup.Route);
			if (tmpGroupClickPath)
			{
				tmpHTML += '<a class="ultravisor-docs-group-title' + tmpGroupActive + '" onclick="_Pict.views[\'Ultravisor-Documentation\'].navigateToPage(\'' + this._escapeAttr(tmpGroupClickPath) + '\')">' + this._escapeHTML(tmpGroup.Name) + '</a>';
			}
			else
			{
				tmpHTML += '<div class="ultravisor-docs-group-title' + tmpGroupActive + '">' + this._escapeHTML(tmpGroup.Name) + '</div>';
			}

			// Module list
			if (tmpGroup.Modules && tmpGroup.Modules.length > 0)
			{
				tmpHTML += '<ul class="ultravisor-docs-module-list">';

				for (let j = 0; j < tmpGroup.Modules.length; j++)
				{
					let tmpModule = tmpGroup.Modules[j];

					if (tmpModule.HasDocs && tmpModule.Route)
					{
						let tmpModulePath = this._extractPagePath(tmpModule.Route);
						let tmpActiveClass = this._isRouteActive(tmpModule.Route) ? ' class="active"' : '';

						if (tmpModulePath)
						{
							tmpHTML += '<li><a' + tmpActiveClass + ' onclick="_Pict.views[\'Ultravisor-Documentation\'].navigateToPage(\'' + this._escapeAttr(tmpModulePath) + '\')">' + this._escapeHTML(tmpModule.Name) + '</a></li>';
						}
						else
						{
							tmpHTML += '<li><a' + tmpActiveClass + '>' + this._escapeHTML(tmpModule.Name) + '</a></li>';
						}
					}
					else
					{
						tmpHTML += '<li><span class="no-docs">' + this._escapeHTML(tmpModule.Name) + '</span></li>';
					}
				}

				tmpHTML += '</ul>';
			}

			tmpHTML += '</div>';
		}

		this.pict.ContentAssignment.assignContent('#Ultravisor-Docs-Sidebar-Nav', tmpHTML);
	}

	/**
	 * Navigate to a documentation page by path.
	 *
	 * @param {string} pPath - The page path (e.g. 'overview', 'features/tasks')
	 */
	navigateToPage(pPath)
	{
		if (!pPath)
		{
			return;
		}

		let tmpDocProvider = this.pict.providers['Docuserve-Documentation'];
		if (!tmpDocProvider)
		{
			return;
		}

		// Update current path
		this.pict.AppData.Docuserve.CurrentPath = pPath;

		// Show loading
		this.pict.ContentAssignment.assignContent('#Ultravisor-Docs-Content-Body',
			'<div class="ultravisor-docs-loading">Loading documentation...</div>');

		// Re-render sidebar to update active states
		this._renderSidebar();

		// Ensure the path has a .md extension
		let tmpFilePath = pPath;
		if (!tmpFilePath.match(/\.md$/))
		{
			tmpFilePath = tmpFilePath + '.md';
		}

		// Fetch the local document
		tmpDocProvider.fetchLocalDocument(tmpFilePath,
			function (pError, pHTML)
			{
				if (pError || !pHTML)
				{
					this.pict.ContentAssignment.assignContent('#Ultravisor-Docs-Content-Body',
						'<div class="ultravisor-docs-not-found"><h2>Page Not Found</h2><p>The document <code>' + this._escapeHTML(pPath) + '</code> could not be loaded.</p></div>');
					return;
				}

				this.pict.ContentAssignment.assignContent('#Ultravisor-Docs-Content-Body', pHTML);

				// Scroll content to top
				let tmpContentEl = document.querySelector('.ultravisor-docs-content');
				if (tmpContentEl)
				{
					tmpContentEl.scrollTop = 0;
				}

				// Intercept internal links to route through our navigation
				this._interceptLinks();
			}.bind(this));
	}

	/**
	 * Intercept links within the rendered content that point to local docs.
	 */
	_interceptLinks()
	{
		let tmpContentBody = document.getElementById('Ultravisor-Docs-Content-Body');
		if (!tmpContentBody)
		{
			return;
		}

		let tmpLinks = tmpContentBody.querySelectorAll('a[href]');
		for (let i = 0; i < tmpLinks.length; i++)
		{
			let tmpLink = tmpLinks[i];
			let tmpHref = tmpLink.getAttribute('href');

			// Skip external links
			if (tmpHref.match(/^https?:\/\//) || tmpHref.match(/^mailto:/))
			{
				tmpLink.setAttribute('target', '_blank');
				tmpLink.setAttribute('rel', 'noopener');
				continue;
			}

			// Handle hash links from docuserve link resolver
			if (tmpHref.match(/^#\/page\//))
			{
				let tmpPagePath = tmpHref.replace(/^#\/page\//, '');
				tmpLink.setAttribute('href', 'javascript:void(0)');
				tmpLink.setAttribute('onclick', '_Pict.views[\'Ultravisor-Documentation\'].navigateToPage(\'' + this._escapeAttr(tmpPagePath) + '\')');
				continue;
			}

			// Handle relative .md links
			if (tmpHref.match(/\.md$/))
			{
				let tmpPagePath = tmpHref.replace(/^\.\//, '').replace(/\.md$/, '');

				// If the current page is in a subdirectory, resolve relative paths
				let tmpCurrentPath = this.pict.AppData.Docuserve.CurrentPath || '';
				let tmpCurrentDir = '';
				let tmpDirParts = tmpCurrentPath.split('/');
				if (tmpDirParts.length > 1)
				{
					tmpDirParts.pop();
					tmpCurrentDir = tmpDirParts.join('/') + '/';
				}

				if (!tmpPagePath.includes('/') && tmpCurrentDir)
				{
					tmpPagePath = tmpCurrentDir + tmpPagePath;
				}

				tmpLink.setAttribute('href', 'javascript:void(0)');
				tmpLink.setAttribute('onclick', '_Pict.views[\'Ultravisor-Documentation\'].navigateToPage(\'' + this._escapeAttr(tmpPagePath) + '\')');
			}
		}
	}

	/**
	 * Perform a sidebar search using the docuserve provider.
	 *
	 * @param {string} pQuery - The search query
	 */
	_performSearch(pQuery)
	{
		let tmpResultsEl = document.getElementById('Ultravisor-Docs-Search-Results');
		if (!tmpResultsEl)
		{
			return;
		}

		if (!pQuery || !pQuery.trim())
		{
			tmpResultsEl.innerHTML = '';
			return;
		}

		let tmpDocProvider = this.pict.providers['Docuserve-Documentation'];
		let tmpResults = tmpDocProvider.search(pQuery);

		if (tmpResults.length === 0)
		{
			tmpResultsEl.innerHTML = '<div style="padding: 0.35em 0.5em; font-size: 0.8em; color:var(--uv-text-tertiary);">No results found.</div>';
			return;
		}

		let tmpMaxResults = 8;
		let tmpHTML = '';

		for (let i = 0; i < tmpResults.length && i < tmpMaxResults; i++)
		{
			let tmpResult = tmpResults[i];
			let tmpPagePath = tmpResult.Key || '';
			let tmpMeta = '';

			if (tmpResult.Group && tmpResult.Module)
			{
				tmpMeta = tmpResult.Group + ' / ' + tmpResult.Module;
			}

			tmpHTML += '<a onclick="_Pict.views[\'Ultravisor-Documentation\'].navigateToPage(\'' + this._escapeAttr(tmpPagePath) + '\')">';
			tmpHTML += '<div class="ultravisor-docs-search-result-title">' + this._escapeHTML(tmpResult.Title) + '</div>';
			if (tmpMeta)
			{
				tmpHTML += '<div class="ultravisor-docs-search-result-meta">' + this._escapeHTML(tmpMeta) + '</div>';
			}
			tmpHTML += '</a>';
		}

		tmpResultsEl.innerHTML = tmpHTML;
	}

	/**
	 * Extract the page path from a hash route for internal navigation.
	 *
	 * @param {string} pRoute - A hash route (e.g. '#/page/overview', '#/doc/group/module')
	 * @returns {string} The extracted page path or empty string
	 */
	_extractPagePath(pRoute)
	{
		if (!pRoute)
		{
			return '';
		}

		// #/page/something
		let tmpPageMatch = pRoute.match(/^#\/page\/(.+)/);
		if (tmpPageMatch)
		{
			return tmpPageMatch[1];
		}

		// #/Home
		if (pRoute === '#/Home')
		{
			return 'overview';
		}

		return '';
	}

	/**
	 * Check whether a route matches the current navigation state.
	 *
	 * @param {string} pRoute - The hash route to check
	 * @returns {boolean} True if the route is active
	 */
	_isRouteActive(pRoute)
	{
		let tmpCurrentPath = this.pict.AppData.Docuserve.CurrentPath || '';
		let tmpRoutePath = this._extractPagePath(pRoute);

		if (!tmpRoutePath || !tmpCurrentPath)
		{
			return false;
		}

		return tmpCurrentPath === tmpRoutePath;
	}

	/**
	 * Escape HTML special characters.
	 *
	 * @param {string} pText - The text to escape
	 * @returns {string} The escaped text
	 */
	_escapeHTML(pText)
	{
		if (!pText)
		{
			return '';
		}
		return String(pText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	/**
	 * Escape a string for use in an HTML attribute.
	 *
	 * @param {string} pText - The text to escape
	 * @returns {string} The escaped text
	 */
	_escapeAttr(pText)
	{
		if (!pText)
		{
			return '';
		}
		return String(pText).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
	}
}

module.exports = UltravisorDocumentationView;

module.exports.default_configuration = _ViewConfiguration;
