.PHONY: dev init proof

dev:
	code .
	bundle exec jekyll serve

init:
	bundle install
	pre-commit install

proof:
	bundle exec jekyll build
	ruby scripts/runHtmlProofer.rb