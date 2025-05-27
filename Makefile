REGISTRY  = ghcr.io/controlplane-com
COMPONENT = external-secret-syncer
IMAGE     = cpln-build/$(COMPONENT)
TAG       ?= latest

push-image:
	docker buildx build --push --platform linux/amd64,linux/arm64 -t \
		$(REGISTRY)/$(IMAGE):$(TAG) \
		.