dev:
	code .
	bundle exec jekyll serve

init:
	bundle install
	pre-commit install