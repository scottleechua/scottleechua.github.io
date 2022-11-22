---
layout: page
permalink: /puzzles/
title: Puzzles
nav: false
nav_order: 3
---

<div class="projects">
<!-- Display projects without categories -->
  {%- assign sorted_projects = site.puzzles | sort: "importance" -%}
  <!-- Generate cards for each project -->
  <div class="grid">
    {%- for project in sorted_projects -%}
      {% include projects.html %}
    {%- endfor %}
  </div>
</div>