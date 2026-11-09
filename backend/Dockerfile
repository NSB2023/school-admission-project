FROM mcr.microsoft.com/dotnet/sdk:10.0 AS source
WORKDIR /src
COPY . .

FROM source AS tests
RUN dotnet restore tests/Admission.Tests.csproj --locked-mode
ENTRYPOINT ["dotnet", "test", "tests/Admission.Tests.csproj", "--no-restore"]

FROM source AS build
RUN dotnet restore Admission.Api.csproj --locked-mode && dotnet publish Admission.Api.csproj --no-restore -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Admission.Api.dll"]
