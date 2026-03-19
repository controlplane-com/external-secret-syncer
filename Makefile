REGISTRY  = ghcr.io/controlplane-com
COMPONENT = external-secret-syncer
IMAGE     = cpln-build/$(COMPONENT)
TAG       ?= 1.3.0

push-image:
	docker buildx build --push --platform linux/amd64,linux/arm64 -t \
		$(REGISTRY)/$(IMAGE):$(TAG) \
		--build-arg IMAGE_VERSION=$(TAG) \
		.