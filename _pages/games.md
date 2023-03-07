---
layout: page
permalink: /games/
title: Games
nav: true
nav_order: 3
---

<div class="projects">
<!-- Display projects without categories -->
  {%- assign sorted_projects = site.games | sort: "importance" -%}
  <!-- Generate cards for each project -->
  <div class="grid">
    {%- for project in sorted_projects -%}
      {% include projects.html %}
    {%- endfor %}
  </div>
</div>