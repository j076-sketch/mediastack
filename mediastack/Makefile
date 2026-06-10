.PHONY: validate validate-lxc test test-env test-ports test-security test-override test-images

validate:
	docker compose config --quiet
	@echo "PASS: docker-compose.yml is valid"

validate-lxc:
	docker compose -f docker-compose.yml -f docker-compose.override.yml config --quiet
	@echo "PASS: docker-compose.yml + Proxmox override is valid"

test:
	@bash tests/run_all.sh

test-env:
	@bash tests/test_env_completeness.sh

test-ports:
	@bash tests/test_port_conflicts.sh

test-security:
	@bash tests/test_security.sh

test-override:
	@bash tests/test_override_coverage.sh

test-images:
	@bash tests/test_image_pinning.sh
