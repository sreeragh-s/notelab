# Zilobase Context

## Domain Terms

### Database view

A Database view is the editor surface for viewing and changing a Database as a Table or Kanban board. It owns the active view, visible properties, row ordering, grouping, sorting, draft property values, and row/property/view commands for that surface.

### Database

A Database is a page-backed collection of pages with properties, rows, views, and property values.

### Page

A Page is the page item represented by a Database row and opened from the editor.

### Clip

A Clip is a webpage captured by the Web Clipper into a Page. It stores the source URL on page metadata, optional database properties, and Tiptap body content converted from sanitized HTML.

### OAuth client

An OAuth client is an application registered to obtain user-delegated access to Zilobase APIs. The official Web Clipper is `zilobase-web-clipper`. Users create other clients while signed in; unauthenticated dynamic registration is off.

### OAuth consent

OAuth consent is the user granting a client specific scopes for one workspace. Allowing consent issues an authorization code; revoking consent stops refresh. Page and database ACLs still apply after consent.

### OAuth scope

An OAuth scope is the coarse capability a client requested (`clips.write`, `pages.read`, `search.read`, …). Missing scope returns `403 insufficient_scope` before ACL. Having a scope never bypasses page or workspace access.
