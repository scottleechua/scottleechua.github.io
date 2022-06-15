---
layout: page
title: Comics
permalink: /comics/
nav: false
nav_order: 1
---

<div class="projects">
<!-- Display projects without categories -->
  {%- assign sorted_projects = site.comics | sort: "importance" -%}
  <!-- Generate cards for each project -->
  <div class="grid">
    {%- for project in sorted_projects -%}
      {% include projects.html %}
    {%- endfor %}
  </div>
</div>